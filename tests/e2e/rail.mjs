// Shared by the browser tests: pick a tool from the rail by its name. Phones show
// one button per tool group (src/ToolRail.tsx): a tool that is not its group's
// button is picked from the group's flyout, as a finger would. Elsewhere every
// tool has its own button. `tap` uses touch instead of the mouse.
export async function pickTool(page,label,{tap=false}={}){
 const press=l=>tap?l.tap():l.click(),buttons=page.locator('.tool-rail .tool-group>div>button');
 const own=buttons.and(page.locator(`[aria-label="${label}"]`));
 if(await own.count()){if(await own.getAttribute('aria-pressed')!=='true')await press(own);return;}
 const i=await buttons.evaluateAll((bs,l)=>bs.findIndex(b=>b.title.split(': ')[1]?.split(', ').includes(l)),label);
 if(i<0)throw new Error(`${label} is not in the tool rail`);
 // A tap selects the group's tool; a tap on the selected tool opens the flyout.
 const group=buttons.nth(i);if(await group.getAttribute('aria-pressed')!=='true')await press(group);
 await press(group);await press(page.locator(`.tool-flyout button[aria-label="${label}"]`));
}
