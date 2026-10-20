// Storage for the licence server: users, sign-in codes and sessions. D1 in
// production (cloud/schema.sql); an in-memory store for tests and local runs.
export type User={id:string;email:string;created_at:number;trial_ends:number;stripe_customer?:string|null;subscription_id?:string|null;subscription_status?:string|null;paid_until?:number|null};
export type Code={email:string;hash:string;expires:number;attempts:number;created_at:number};

export interface Store{
 userByEmail(email:string):Promise<User|undefined>;
 userById(id:string):Promise<User|undefined>;
 userByCustomer(customer:string):Promise<User|undefined>;
 createUser(user:User):Promise<void>;
 updateUser(id:string,patch:Partial<User>):Promise<void>;
 addCode(code:Code):Promise<void>;
 codes(email:string):Promise<Code[]>;
 recordAttempt(email:string,hash:string):Promise<void>;
 deleteCodes(email:string):Promise<void>;
 addSession(hash:string,userId:string,expires:number):Promise<void>;
 session(hash:string):Promise<{user_id:string;expires:number}|undefined>;
 deleteSession(hash:string):Promise<void>;
}

export class MemoryStore implements Store{
 users=new Map<string,User>();codeList:Code[]=[];sessions=new Map<string,{user_id:string;expires:number}>();
 async userByEmail(email:string){return [...this.users.values()].find(u=>u.email===email);}
 async userById(id:string){return this.users.get(id);}
 async userByCustomer(customer:string){return [...this.users.values()].find(u=>u.stripe_customer===customer);}
 async createUser(user:User){this.users.set(user.id,{...user});}
 async updateUser(id:string,patch:Partial<User>){const u=this.users.get(id);if(u)this.users.set(id,{...u,...patch});}
 async addCode(code:Code){this.codeList.push({...code});}
 async codes(email:string){return this.codeList.filter(c=>c.email===email);}
 async recordAttempt(email:string,hash:string){for(const c of this.codeList)if(c.email===email&&c.hash===hash)c.attempts++;}
 async deleteCodes(email:string){this.codeList=this.codeList.filter(c=>c.email!==email);}
 async addSession(hash:string,user_id:string,expires:number){this.sessions.set(hash,{user_id,expires});}
 async session(hash:string){return this.sessions.get(hash);}
 async deleteSession(hash:string){this.sessions.delete(hash);}
}

// Minimal D1 surface used here (Cloudflare's D1Database).
type D1={prepare(sql:string):{bind(...values:unknown[]):{first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>;run():Promise<unknown>}}};
export class D1Store implements Store{
 constructor(private db:D1){}
 private one<T>(sql:string,...v:unknown[]){return this.db.prepare(sql).bind(...v).first<T>().then(r=>r??undefined);}
 private run(sql:string,...v:unknown[]){return this.db.prepare(sql).bind(...v).run().then(()=>{});}
 userByEmail(email:string){return this.one<User>('SELECT * FROM users WHERE email=?',email);}
 userById(id:string){return this.one<User>('SELECT * FROM users WHERE id=?',id);}
 userByCustomer(customer:string){return this.one<User>('SELECT * FROM users WHERE stripe_customer=?',customer);}
 createUser(u:User){return this.run('INSERT INTO users (id,email,created_at,trial_ends) VALUES (?,?,?,?)',u.id,u.email,u.created_at,u.trial_ends);}
 updateUser(id:string,patch:Partial<User>){
  const keys=Object.keys(patch).filter(k=>['stripe_customer','subscription_id','subscription_status','paid_until'].includes(k)) as (keyof User)[];
  if(!keys.length)return Promise.resolve();
  return this.run(`UPDATE users SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=?`,...keys.map(k=>patch[k]??null),id);
 }
 addCode(c:Code){return this.run('INSERT INTO codes (email,hash,expires,attempts,created_at) VALUES (?,?,?,?,?)',c.email,c.hash,c.expires,c.attempts,c.created_at);}
 codes(email:string){return this.db.prepare('SELECT * FROM codes WHERE email=?').bind(email).all<Code>().then(r=>r.results);}
 recordAttempt(email:string,hash:string){return this.run('UPDATE codes SET attempts=attempts+1 WHERE email=? AND hash=?',email,hash);}
 deleteCodes(email:string){return this.run('DELETE FROM codes WHERE email=?',email);}
 addSession(hash:string,userId:string,expires:number){return this.run('INSERT INTO sessions (hash,user_id,expires) VALUES (?,?,?)',hash,userId,expires);}
 session(hash:string){return this.one<{user_id:string;expires:number}>('SELECT user_id,expires FROM sessions WHERE hash=?',hash);}
 deleteSession(hash:string){return this.run('DELETE FROM sessions WHERE hash=?',hash);}
}
