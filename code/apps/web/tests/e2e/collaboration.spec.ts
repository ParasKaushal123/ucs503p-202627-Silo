import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import path from 'node:path';
const API='http://localhost:8100';
async function account(c:BrowserContext,name:string){const r=await c.request.post(API+'/auth/register',{data:{name,email:`${name}-${Date.now()}-${Math.random()}@silo.test`,password:'Test-password-123!'}});expect(r.status()).toBe(201);return r.json();}
async function saved(p:Page){await expect(p.locator('header').getByText('Saved',{exact:true})).toBeVisible({timeout:25000});}
async function files(p:Page){await p.getByTitle('Files',{exact:true}).click();await expect(p.locator('.cm-content')).toBeVisible();}
test('original UI upload and shared editing end to end',async({browser})=>{
 const oc=await browser.newContext(),ec=await browser.newContext(),vc=await browser.newContext();
 await account(oc,'Alex');const editor=await account(ec,'Morgan');await account(vc,'Sam');
 const a=await oc.newPage(),b=await ec.newPage(),v=await vc.newPage();const errors:string[]=[];
 for(const p of [a,b,v])p.on('pageerror',e=>errors.push(e.message));
 await a.goto('/dashboard');await a.getByRole('button',{name:'+ New app',exact:true}).first().click();
 await a.getByPlaceholder('Invoice Generator').fill('Original counter app');
 await a.locator('input[type="file"]').setInputFiles(path.resolve('tests/fixtures/counter.zip'));
 await a.getByRole('button',{name:'Create and build',exact:true}).click();
 await expect(a.getByText('Original counter app',{exact:true}).first()).toBeVisible({timeout:20000});
 const app=(await(await oc.request.get(API+'/apps')).json()).find((x:any)=>x.name==='Original counter app');
 await a.screenshot({path:'test-results/restored-dashboard.png',fullPage:true});
 await a.goto(`/apps/${app.id}`);const room=a.frameLocator('iframe[title="Original counter app preview"]');
 await expect(room.getByRole('heading',{name:'Original uploaded app'})).toBeVisible();
 await room.getByRole('button',{name:'Count',exact:true}).click();await expect(room.locator('#count')).toHaveText('1');
 await a.screenshot({path:'test-results/restored-app-room.png',fullPage:true});
 await a.getByRole('button',{name:/Workbench/}).click();await saved(a);
 const draft=await(await oc.request.post(`${API}/apps/${app.id}/draft`)).json();
 for(const[c,role]of [[ec,'editor'],[vc,'viewer']]as const){const i=await(await oc.request.post(`${API}/apps/${app.id}/invites`,{data:{role}})).json();expect((await c.request.post(`${API}/invites/${i.url.split('/').pop()}/accept`)).ok()).toBeTruthy();}
 await b.goto(`/apps/${app.id}/workbench`);await saved(b);await v.goto(`/apps/${app.id}/workbench`);await saved(v);
 await files(a);await files(b);await files(v);await expect(v.locator('.cm-content')).toHaveAttribute('contenteditable','false');
 for(const p of[a,b]){await p.locator('.cm-content').click();await p.keyboard.press('Control+End');}
 await Promise.all([a.keyboard.insertText('\n<!-- Alex edited -->'),b.keyboard.insertText('\n<!-- Morgan edited -->')]);await saved(a);await saved(b);
 await expect(a.locator('.cm-content')).toContainText('Morgan edited');await expect(b.locator('.cm-content')).toContainText('Alex edited');
 await b.reload();await saved(b);await files(b);await expect(b.locator('.cm-content')).toContainText('Alex edited');
 await a.getByRole('button',{name:'Checkpoint',exact:true}).click();await a.getByRole('textbox',{name:'Checkpoint name'}).fill('Before heading change');
 await a.getByRole('button',{name:'Save checkpoint',exact:true}).click();await expect(a.getByRole('dialog')).toHaveCount(0);
 await b.getByTitle('Comments',{exact:true}).click();await b.getByRole('textbox',{name:'Comment',exact:true}).fill('Keep the uploaded app design');await b.getByRole('button',{name:'Post comment'}).click();
 await a.getByTitle('Comments',{exact:true}).click();await expect(a.getByText('Keep the uploaded app design',{exact:true})).toBeVisible({timeout:10000});
 await a.getByRole('textbox',{name:'Change request or team message'}).fill('We are editing the original app together');await a.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(b.getByText('We are editing the original app together',{exact:true})).toBeVisible({timeout:10000});
 await a.getByRole('button',{name:'Build preview',exact:true}).first().click();await a.getByTitle('App preview',{exact:true}).click();
 const frame=a.frameLocator('iframe[title="Shared draft preview"]');await expect(frame.getByRole('heading',{name:'Original uploaded app'})).toBeVisible();
 await a.getByRole('button',{name:'Push update',exact:true}).click();await a.getByRole('button',{name:'Publish now',exact:true}).click();await expect(a.getByRole('dialog')).toHaveCount(0);
 await a.screenshot({path:'test-results/restored-workbench.png',fullPage:true});
 const fresh=await(await oc.request.get(`${API}/drafts/${draft.id}`)).json(),source=structuredClone(fresh.files);
 const html=Object.values(source).find((f:any)=>f.path==='index.html')as any;html.content=html.content.replace('Original uploaded app','Shared original app');
 expect((await oc.request.post(`${API}/drafts/${draft.id}/proposals`,{data:{prompt:'Change only the uploaded app heading',files:source,expected_hash:fresh.source_hash}})).status()).toBe(201);
 await a.getByRole('button',{name:'Apply to draft',exact:true}).click({timeout:10000});await expect(a.getByRole('dialog').locator('pre')).toContainText('Shared original app');
 await a.getByRole('button',{name:'Apply reviewed change',exact:true}).click();await saved(a);await saved(b);await expect(frame.getByRole('heading',{name:'Shared original app'})).toBeVisible();
 const published=await(await oc.request.get(`${API}/apps/${app.id}/live`)).json();expect(published.html).toContain('Original uploaded app');
 expect((await vc.request.post(`${API}/drafts/${draft.id}/checkpoints`,{data:{label:'Denied'}})).status()).toBe(403);
 expect((await oc.request.delete(`${API}/apps/${app.id}/members/${editor.id}`)).status()).toBe(204);await expect(b.locator('header')).toContainText('Access changed',{timeout:15000});
 expect((await ec.request.get(`${API}/drafts/${draft.id}`)).status()).toBe(404);
 await files(a);await expect(a.locator('.cm-content')).toContainText('Shared original app');await a.screenshot({path:'test-results/restored-code-editor.png',fullPage:true});
 expect(errors).toEqual([]);await oc.close();await ec.close();await vc.close();
});

test('original drawers handle file commands, restore, export and reconnect',async({browser})=>{
 const oc=await browser.newContext(),ec=await browser.newContext();await account(oc,'Taylor');await account(ec,'Casey');
 const app=await(await oc.request.post(API+'/apps',{data:{name:'File operations'}})).json();
 const upload=await oc.request.post(`${API}/apps/${app.id}/versions`,{multipart:{file:{name:'counter.zip',mimeType:'application/zip',buffer:require('node:fs').readFileSync(path.resolve('tests/fixtures/counter.zip'))}}});expect(upload.status()).toBe(201);
 const draft=await(await oc.request.post(`${API}/apps/${app.id}/draft`)).json();const invite=await(await oc.request.post(`${API}/apps/${app.id}/invites`,{data:{role:'editor'}})).json();
 await ec.request.post(`${API}/invites/${invite.url.split('/').pop()}/accept`);
 const a=await oc.newPage(),b=await ec.newPage();await a.goto(`/apps/${app.id}/workbench`);await saved(a);await b.goto(`/apps/${app.id}/workbench`);await saved(b);await files(a);await files(b);
 await a.getByRole('button',{name:'Checkpoint',exact:true}).click();await a.getByRole('textbox',{name:'Checkpoint name'}).fill('Original source');await a.getByRole('button',{name:'Save checkpoint',exact:true}).click();await expect(a.getByRole('dialog')).toHaveCount(0);
 await a.getByRole('button',{name:'+ New file',exact:true}).click();await a.getByRole('textbox',{name:'File path'}).fill('notes.txt');await a.getByRole('button',{name:'Save file',exact:true}).click();await saved(a);
 await expect(b.getByRole('button',{name:/notes.txt/})).toBeVisible();await a.getByRole('button',{name:/notes.txt/}).click();await a.getByRole('button',{name:'Rename',exact:true}).click();await a.getByRole('textbox',{name:'File path'}).fill('team-notes.txt');await a.getByRole('button',{name:'Save file',exact:true}).click();await saved(a);await expect(b.getByRole('button',{name:/team-notes.txt/})).toBeVisible();
 await a.getByRole('button',{name:/team-notes.txt/}).click();await a.locator('.cm-content').fill('Shared notes after rename');await saved(a);
 const exportResult=await oc.request.get(`${API}/drafts/${draft.id}/export`);expect(exportResult.headers()['content-type']).toContain('application/zip');
 await ec.setOffline(true);await expect(b.locator('header')).toContainText(/Reconnecting|Offline/,{timeout:10000});await expect(b.locator('.cm-content')).toHaveAttribute('contenteditable','false');await ec.setOffline(false);await saved(b);
 await a.getByTitle('Versions',{exact:true}).click();await a.getByRole('button',{name:'Restore',exact:true}).click();await a.getByRole('dialog').getByRole('button',{name:'Restore checkpoint',exact:true}).click();await expect(a.getByRole('dialog')).toHaveCount(0);await saved(a);
 await expect(b.locator('header')).toContainText('Draft restored',{timeout:15000});await expect(b.getByRole('button',{name:'Export recovery',exact:true})).toBeVisible();await b.reload();await saved(b);await files(b);await expect(b.getByRole('button',{name:/team-notes.txt/})).toHaveCount(0);await expect(b.locator('.cm-content')).toContainText('Original uploaded app');
 const persisted=await(await oc.request.get(`${API}/drafts/${draft.id}`)).json();expect(persisted.generation).toBeGreaterThan(1);expect(Object.values(persisted.files)).toHaveLength(1);
 await oc.close();await ec.close();
});

test('invited editor publishes a code change that the owner sees',async({browser})=>{
 const perms={permissions:['clipboard-read','clipboard-write']};
 const oc=await browser.newContext(perms),ec=await browser.newContext(perms);await account(oc,'Owner');await account(ec,'Editor');
 const a=await oc.newPage(),b=await ec.newPage();const errors:string[]=[];for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
 // 1. Owner uploads an app, then copies an editor invitation link from Share.
 await a.goto('/dashboard');await a.getByRole('button',{name:'+ New app',exact:true}).first().click();
 await a.getByPlaceholder('Invoice Generator').fill('Shared publish app');
 await a.locator('input[type="file"]').setInputFiles(path.resolve('tests/fixtures/counter.zip'));
 await a.getByRole('button',{name:'Create and build',exact:true}).click();
 await expect(a.getByText('Shared publish app',{exact:true}).first()).toBeVisible({timeout:20000});
 const app=(await(await oc.request.get(API+'/apps')).json()).find((x:any)=>x.name==='Shared publish app');
 await a.goto(`/apps/${app.id}/workbench`);await saved(a);
 await a.getByRole('button',{name:'Share',exact:true}).click();await a.getByRole('button',{name:'Copy invitation link',exact:true}).click();
 const link=await a.getByRole('textbox',{name:'Invitation link'}).inputValue();expect(link).toContain('/join/');
 // The owner keeps their App Room open while the collaborator works.
 await a.goto(`/apps/${app.id}`);const room=a.frameLocator('iframe[title="Shared publish app preview"]');
 await expect(room.getByRole('heading',{name:'Original uploaded app'})).toBeVisible();
 // 2. A second account opens the link, edits the code and publishes.
 await b.goto(link);await expect(b).toHaveURL(new RegExp(`/apps/${app.id}/workbench`),{timeout:20000});await saved(b);await files(b);
 const draft=await(await ec.request.post(`${API}/apps/${app.id}/draft`)).json();
 const html=(Object.values(draft.files)as any[]).find(f=>f.path==='index.html');
 await b.locator('.cm-content').fill(html.content.replace('Original uploaded app','Changed by the editor'));await saved(b);
 await b.getByRole('button',{name:'Build preview',exact:true}).first().click();await b.getByTitle('App preview',{exact:true}).click();
 await expect(b.frameLocator('iframe[title="Shared draft preview"]').getByRole('heading',{name:'Changed by the editor'})).toBeVisible();
 await b.getByRole('button',{name:'Push update',exact:true}).click();await b.getByRole('button',{name:'Publish now',exact:true}).click();await expect(b.getByRole('dialog')).toHaveCount(0);
 // 3. The owner's open page switches to the published change without a reload.
 await expect(room.getByRole('heading',{name:'Changed by the editor'})).toBeVisible({timeout:20000});
 await a.screenshot({path:'test-results/owner-sees-editor-publish.png',fullPage:true});
 expect(errors).toEqual([]);await oc.close();await ec.close();
});
