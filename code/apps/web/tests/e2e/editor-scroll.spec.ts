import {test,expect} from '@playwright/test';
const API='http://localhost:8100';
test('code editor scrolls a long file inside the stage',async({browser})=>{
 const c=await browser.newContext();
 expect((await c.request.post(API+'/auth/register',{data:{name:'Scroller',email:`scroll-${Date.now()}@silo.test`,password:'Test-password-123!'}})).status()).toBe(201);
 const app=await(await c.request.post(API+'/apps',{data:{name:'Long file'}})).json();
 const lines=Array.from({length:300},(_,i)=>`<p>Line ${i+1}</p>`).join('\n');
 const upload=await c.request.post(`${API}/apps/${app.id}/versions`,{multipart:{file:{name:'index.html',mimeType:'text/html',buffer:Buffer.from(`<!doctype html><html><head></head><body>\n${lines}\n</body></html>`)}}});
 expect(upload.status()).toBe(201);
 const p=await c.newPage();await p.goto(`/apps/${app.id}/workbench`);
 await expect(p.locator('header').getByText('Saved',{exact:true})).toBeVisible({timeout:25000});
 await p.getByTitle('Files',{exact:true}).click();await expect(p.locator('.cm-content')).toBeVisible();
 // The editor must fit the viewport and scroll itself, not grow to its content height.
 const scroller=p.locator('.cm-scroller'),box=await scroller.boundingBox();
 expect(box!.height).toBeLessThan(p.viewportSize()!.height);
 await p.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await p.mouse.wheel(0,1500);
 await expect.poll(()=>scroller.evaluate(s=>s.scrollTop)).toBeGreaterThan(0);
 await p.keyboard.press('Control+End');await expect(p.getByText('Line 300',{exact:false})).toBeInViewport();
 await c.close();
});
