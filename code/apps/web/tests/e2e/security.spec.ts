import {test,expect} from '@playwright/test';
const API='http://localhost:8100';
const CLEAN='<!doctype html><html><head><title>Notes</title></head><body><h1>Notes</h1></body></html>';
const RISKY='<!doctype html><html><head><title>Notes</title><script src="https://cdn.example.net/widget.js"></script></head>'
 +'<body><h1>Notes</h1><div id="out"></div><script>out.innerHTML = location.hash; localStorage.setItem("token", "x")</script></body></html>';
test('security track is an interactive flow with labels, changes and findings',async({browser})=>{
 const c=await browser.newContext();const errors:string[]=[];
 expect((await c.request.post(API+'/auth/register',{data:{name:'Sec',email:`sec-${Date.now()}@silo.test`,password:'Test-password-123!'}})).status()).toBe(201);
 const app=await(await c.request.post(API+'/apps',{data:{name:'Notes app'}})).json();
 for(const html of [CLEAN,RISKY])expect((await c.request.post(`${API}/apps/${app.id}/versions`,{multipart:{file:{name:'index.html',mimeType:'text/html',buffer:Buffer.from(html)}}})).status()).toBe(201);
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 // Reached from the App Room header.
 await p.goto(`/apps/${app.id}`);await p.getByRole('button',{name:'Security track',exact:true}).click();
 await expect(p).toHaveURL(new RegExp(`/apps/${app.id}/security`));
 // The sample app's own localStorage call is blocked by the App Room's preview sandbox; only this page's errors count.
 errors.length=0;
 const builds=p.locator('.react-flow__node-build');
 await expect(builds).toHaveCount(2,{timeout:30000});
 await expect(p.getByText('Click a build to open its nutrition label and changes')).toBeVisible();
 // The expanding edge and v2's child nodes: what it added.
 await expect(p.locator('.react-flow__edge-text').getByText(/EXPANDING/)).toBeVisible();
 const items=p.locator('.react-flow__node-item');
 await expect(items.filter({hasText:'Writes raw HTML into the page'})).toBeVisible();
 await expect(items.filter({hasText:'Loads code from other websites'})).toBeVisible();
 // Origin opens on its nutrition label.
 await builds.nth(0).click();
 await expect(p.getByRole('tab',{name:'Nutrition label'})).toHaveAttribute('aria-selected','true');
 await expect(p.getByRole('heading',{name:'Capability Facts'})).toBeVisible();
 await expect(p.getByText('No network, file, process or browser access detected.')).toBeVisible();
 await p.screenshot({path:'test-results/security-origin.png'});
 // A later build opens on what changed.
 await p.keyboard.press('ArrowRight');
 await expect(p.getByRole('tab',{name:'Changes vs v1'})).toHaveAttribute('aria-selected','true');
 await expect(p.getByText(/This build can now .*load code from other websites \(cdn\.example\.net\)/)).toBeVisible();
 await expect(p.getByRole('button',{name:/index\.html/})).toBeVisible();
 await p.screenshot({path:'test-results/security-track.png'});
 // Clicking a finding node jumps to that finding.
 await items.filter({hasText:'Writes raw HTML into the page'}).click();
 await expect(p.getByRole('tab',{name:/Findings \(/})).toHaveAttribute('aria-selected','true');
 await expect(p.getByRole('heading',{name:'Writes raw HTML into the page'})).toBeInViewport();
 await expect(p.getByRole('button',{name:/Fix with AI/}).first()).toBeVisible();
 // Compare any two builds: from v1, compare with v2 (reads as a reduction).
 await builds.nth(0).click();
 await p.getByRole('button',{name:'Compare two builds'}).click();await builds.nth(1).click();
 await expect(p.getByRole('tab',{name:'Changes vs v2'})).toBeVisible();
 await expect(p.getByText('Reducing',{exact:true}).first()).toBeVisible();
 // Across builds: the capability matrix and risk chart.
 await expect(p.getByRole('cell',{name:/Loads code from other websites/})).toBeVisible();
 await p.getByRole('button',{name:'Open v1'}).click();
 expect(errors).toEqual([]);await c.close();
});
