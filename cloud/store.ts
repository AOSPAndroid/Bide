// D1 in production; MemoryStore implements the same atomic operations for tests.
export type User={id:string;email:string;created_at:number;trial_ends:number;stripe_customer?:string|null;subscription_id?:string|null;subscription_status?:string|null;paid_until?:number|null};
export type Code={email:string;hash:string;expires:number;attempts:number;created_at:number};
export type BillingUser=Pick<User,'stripe_customer'|'subscription_id'|'subscription_status'|'paid_until'>;
export type CheckoutState={checkout_key:string|null;checkout_params:string|null;checkout_session:string|null;checkout_url:string|null;checkout_expires:number|null};
export type BillingState=CheckoutState&{user_id:string;lock_token:string|null;lock_expires:number};
export const emptyCheckout=():CheckoutState=>({checkout_key:null,checkout_params:null,checkout_session:null,checkout_url:null,checkout_expires:null});

export interface Store{
 userByEmail(email:string):Promise<User|undefined>;
 userById(id:string):Promise<User|undefined>;
 userByCustomer(customer:string):Promise<User|undefined>;
 createUser(user:User):Promise<void>;
 updateUser(id:string,patch:Partial<User>):Promise<void>;
 addCode(code:Code):Promise<void>;
 codes(email:string):Promise<Code[]>;
 consumeCode(email:string,hash:string,now:number):Promise<boolean>;
 recordFailedCodeAttempt(email:string,now:number):Promise<void>;
 addSession(hash:string,userId:string,expires:number):Promise<void>;
 session(hash:string):Promise<{user_id:string;expires:number}|undefined>;
 deleteSession(hash:string):Promise<void>;
 acquireBilling(userId:string,token:string,now:number,expires:number):Promise<BillingState|undefined>;
 renewBilling(userId:string,token:string,now:number,expires:number):Promise<boolean>;
 releaseBilling(userId:string,token:string):Promise<void>;
 saveBilling(userId:string,token:string,now:number,user:BillingUser,checkout:CheckoutState,eventId?:string):Promise<boolean>;
 stripeEventProcessed(eventId:string):Promise<boolean>;
}

export class MemoryStore implements Store{
 users=new Map<string,User>();codeList:Code[]=[];sessions=new Map<string,{user_id:string;expires:number}>();
 billing=new Map<string,BillingState>();stripeEvents=new Set<string>();
 async userByEmail(email:string){return [...this.users.values()].find(u=>u.email===email);}
 async userById(id:string){return this.users.get(id);}
 async userByCustomer(customer:string){return [...this.users.values()].find(u=>u.stripe_customer===customer);}
 async createUser(user:User){if(![...this.users.values()].some(u=>u.email===user.email))this.users.set(user.id,{...user});}
 async updateUser(id:string,patch:Partial<User>){const u=this.users.get(id);if(u)this.users.set(id,{...u,...patch});}
 async addCode(code:Code){this.codeList.push({...code});}
 async codes(email:string){return this.codeList.filter(c=>c.email===email);}
 async consumeCode(email:string,hash:string,now:number){
  if(!this.codeList.some(c=>c.email===email&&c.hash===hash&&c.expires>now&&c.attempts<5))return false;
  this.codeList=this.codeList.filter(c=>c.email!==email);return true;
 }
 async recordFailedCodeAttempt(email:string,now:number){for(const c of this.codeList)if(c.email===email&&c.expires>now&&c.attempts<5)c.attempts++;}
 async addSession(hash:string,user_id:string,expires:number){this.sessions.set(hash,{user_id,expires});}
 async session(hash:string){return this.sessions.get(hash);}
 async deleteSession(hash:string){this.sessions.delete(hash);}
 async acquireBilling(user_id:string,lock_token:string,now:number,lock_expires:number){
  const current=this.billing.get(user_id);if(current&&current.lock_expires>now)return undefined;
  const next={...emptyCheckout(),...current,user_id,lock_token,lock_expires};this.billing.set(user_id,next);return {...next};
 }
 async renewBilling(userId:string,token:string,now:number,expires:number){
  const state=this.billing.get(userId);if(!state||state.lock_token!==token||state.lock_expires<=now)return false;
  state.lock_expires=expires;return true;
 }
 async releaseBilling(userId:string,token:string){const state=this.billing.get(userId);if(state?.lock_token===token){state.lock_token=null;state.lock_expires=0;}}
 async saveBilling(userId:string,token:string,now:number,user:BillingUser,checkout:CheckoutState,eventId?:string){
  const state=this.billing.get(userId),current=this.users.get(userId);
  if(!state||!current||state.lock_token!==token||state.lock_expires<=now)return false;
  if(eventId&&this.stripeEvents.has(eventId))throw new Error('Stripe event already processed.');
  this.users.set(userId,{...current,...user});this.billing.set(userId,{...state,...checkout});
  if(eventId)this.stripeEvents.add(eventId);return true;
 }
 async stripeEventProcessed(eventId:string){return this.stripeEvents.has(eventId);}
}

type D1Result={results?:unknown[];meta:{changes:number}};
type D1Statement={bind(...values:unknown[]):D1Statement;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>;run():Promise<D1Result>};
// D1 batch executes all statements transactionally, including event acknowledgement.
type D1={prepare(sql:string):D1Statement;batch(statements:D1Statement[]):Promise<D1Result[]>};
export class D1Store implements Store{
 constructor(private db:D1){}
 private one<T>(sql:string,...v:unknown[]){return this.db.prepare(sql).bind(...v).first<T>().then(r=>r??undefined);}
 private run(sql:string,...v:unknown[]){return this.db.prepare(sql).bind(...v).run().then(()=>{});}
 userByEmail(email:string){return this.one<User>('SELECT * FROM users WHERE email=?',email);}
 userById(id:string){return this.one<User>('SELECT * FROM users WHERE id=?',id);}
 userByCustomer(customer:string){return this.one<User>('SELECT * FROM users WHERE stripe_customer=?',customer);}
 createUser(u:User){return this.run('INSERT INTO users (id,email,created_at,trial_ends) VALUES (?,?,?,?) ON CONFLICT(email) DO NOTHING',u.id,u.email,u.created_at,u.trial_ends);}
 updateUser(id:string,patch:Partial<User>){
  const keys=Object.keys(patch).filter(k=>['stripe_customer','subscription_id','subscription_status','paid_until'].includes(k)) as (keyof User)[];
  if(!keys.length)return Promise.resolve();
  return this.run(`UPDATE users SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=?`,...keys.map(k=>patch[k]??null),id);
 }
 addCode(c:Code){return this.run('INSERT INTO codes (email,hash,expires,attempts,created_at) VALUES (?,?,?,?,?)',c.email,c.hash,c.expires,c.attempts,c.created_at);}
 codes(email:string){return this.db.prepare('SELECT * FROM codes WHERE email=?').bind(email).all<Code>().then(r=>r.results);}
 async consumeCode(email:string,hash:string,now:number){
  // One statement validates the code and invalidates all of that email's codes.
  const result=await this.db.prepare('DELETE FROM codes WHERE email=? AND EXISTS (SELECT 1 FROM codes WHERE email=? AND hash=? AND expires>? AND attempts<5) RETURNING hash').bind(email,email,hash,now).all<{hash:string}>();
  return result.results.length>0;
 }
 recordFailedCodeAttempt(email:string,now:number){return this.run('UPDATE codes SET attempts=attempts+1 WHERE email=? AND expires>? AND attempts<5',email,now);}
 addSession(hash:string,userId:string,expires:number){return this.run('INSERT INTO sessions (hash,user_id,expires) VALUES (?,?,?)',hash,userId,expires);}
 session(hash:string){return this.one<{user_id:string;expires:number}>('SELECT user_id,expires FROM sessions WHERE hash=?',hash);}
 deleteSession(hash:string){return this.run('DELETE FROM sessions WHERE hash=?',hash);}
 acquireBilling(userId:string,token:string,now:number,expires:number){
  return this.one<BillingState>('INSERT INTO billing_state (user_id,lock_token,lock_expires) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET lock_token=excluded.lock_token,lock_expires=excluded.lock_expires WHERE billing_state.lock_expires<=? RETURNING *',userId,token,expires,now);
 }
 async renewBilling(userId:string,token:string,now:number,expires:number){return !!await this.one('UPDATE billing_state SET lock_expires=? WHERE user_id=? AND lock_token=? AND lock_expires>? RETURNING user_id',expires,userId,token,now);}
 releaseBilling(userId:string,token:string){return this.run('UPDATE billing_state SET lock_token=NULL,lock_expires=0 WHERE user_id=? AND lock_token=?',userId,token);}
 async saveBilling(userId:string,token:string,now:number,user:BillingUser,checkout:CheckoutState,eventId?:string){
  const guard='EXISTS (SELECT 1 FROM billing_state WHERE user_id=? AND lock_token=? AND lock_expires>?)';
  const statements=[
   this.db.prepare(`UPDATE users SET stripe_customer=?,subscription_id=?,subscription_status=?,paid_until=? WHERE id=? AND ${guard}`).bind(user.stripe_customer??null,user.subscription_id??null,user.subscription_status??null,user.paid_until??null,userId,userId,token,now),
   this.db.prepare('UPDATE billing_state SET checkout_key=?,checkout_params=?,checkout_session=?,checkout_url=?,checkout_expires=? WHERE user_id=? AND lock_token=? AND lock_expires>?').bind(checkout.checkout_key,checkout.checkout_params,checkout.checkout_session,checkout.checkout_url,checkout.checkout_expires,userId,token,now)
  ];
  if(eventId)statements.push(this.db.prepare(`INSERT INTO stripe_events (id,user_id,processed_at) SELECT ?,?,? WHERE ${guard}`).bind(eventId,userId,now,userId,token,now));
  const results=await this.db.batch(statements);return results[0].meta.changes===1;
 }
 async stripeEventProcessed(eventId:string){return !!await this.one('SELECT id FROM stripe_events WHERE id=?',eventId);}
}
