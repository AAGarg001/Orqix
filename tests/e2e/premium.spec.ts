import {test,expect} from '@playwright/test';

test('premium UI route and viewport sweep preserves navigation and permissions',async({page})=>{
  test.setTimeout(240000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const failedRequests:string[]=[];page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)failedRequests.push(`${r.status()} ${new URL(r.url()).pathname}`);});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/admin/login');
  await page.getByLabel('Email address').fill('admin@orqix.test');
  await page.getByLabel('Password',{exact:true}).fill('OrqixTest!2026Secure');
  await page.getByRole('button',{name:'Login as Admin',exact:true}).click();
  await expect(page.locator('.oq-sidebar')).toBeVisible();
  const routes=['/dashboard','/admin/users','/admin/teams','/admin/departments','/admin/roles','/admin/client-allocation','/admin/organizations','/admin/subscription-plans','/admin/client-requests','/admin/saas-dashboard','/clients','/accounts','/tasks','/bots/extract','/bots/upload','/bots/delete','/approvals','/reports','/ai-assistant','/audit','/settings'];
  for(const route of routes){
    await page.setViewportSize({width:1440,height:900});
    await page.goto(route);
    for(const width of [1440,1280,1024,768,390,320]){
      await page.setViewportSize({width,height:900});
      await expect(page.locator('#main-content h1')).toBeVisible();
      await expect(page.locator('#main-content [role="alert"]')).toHaveCount(0);
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),{message:`Page overflow at ${width}px: ${route}`}).toBeTruthy();
      await expect(page.getByRole('textbox',{name:'Search clients',exact:true})).toHaveCount(0);
      if(width===1440&&['/dashboard','/bots/extract','/admin/client-allocation','/ai-assistant','/settings'].includes(route)) await page.screenshot({path:`test-results/premium-${route.replaceAll('/','-')}.png`,fullPage:true});
    }
  }
  await page.setViewportSize({width:390,height:844});await page.goto('/dashboard');
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await expect(page.getByRole('button',{name:'Close navigation',exact:true}).first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Open navigation',exact:true})).toBeFocused();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Profile menu',exact:true}).click();
  await expect(page.getByRole('region',{name:'Profile actions'})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('region',{name:'Profile actions'})).toHaveCount(0);
  await page.getByRole('button',{name:'Notifications',exact:true}).click();
  await expect(page.getByRole('region',{name:'Notifications',exact:true})).toBeVisible();
  await page.locator('#main-content h1').click();await expect(page.getByRole('region',{name:'Notifications',exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('authentication and setup surfaces fit all required widths',async({page})=>{
  test.setTimeout(90000);
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const route of ['/admin/login','/login','/setup-password?token=ui-layout-only']){
    await page.goto(route);
    for(const width of [1440,1280,1024,768,390,320]){
      await page.setViewportSize({width,height:900});
      await expect(page.getByRole('heading').first()).toBeVisible();
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),{message:`Authentication overflow: ${route}, ${width}px`}).toBeTruthy();
    }
    if(route==='/admin/login')await page.screenshot({path:'test-results/premium-admin-login-mobile.png',fullPage:true});
  }
});
