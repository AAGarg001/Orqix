import {test,expect} from '@playwright/test';
test('Razorpay test purchase UI verifies before success and keeps live billing unchanged',async({page})=>{
 test.setTimeout(90000);await page.emulateMedia({reducedMotion:'reduce'});
 const origin='http://localhost:5175';
 const post=async(path:string,data:any)=>{const r=await page.request.post(path,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBeTruthy();return r.json();};
 await post('/api/auth/login',{email:'admin@orqix.test',password:'OrqixTest!2026Secure',portal:'admin'});
 const org=await post('/api/saas/organizations',{name:'Sandbox Billing Company',code:'BILLING-SANDBOX',ownerName:'Billing Client',ownerEmail:'billing-owner@client.test'});
 await post('/api/auth/setup-password',{token:new URL(org.setupLink,origin).searchParams.get('token'),password:'BillingClient!2026Secure'});
 await post('/api/auth/login',{email:'billing-owner@client.test',password:'BillingClient!2026Secure',portal:'client'});
 await page.goto('/client/subscriptions');await expect(page.getByRole('button',{name:'Try Premium',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Try Premium',exact:true}).click();await page.getByRole('checkbox',{name:'I understand this is a sandbox purchase with no real charges.'}).check();await expect(page.getByRole('button',{name:'Continue to Razorpay Test Checkout',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 const plans=[{id:'premium',name:'Premium',monthlyPaise:249900,description:'Isolated browser fixture',features:['Certificate insights','Reports'],units:6}];
 const order={id:'browser-test-order',planId:'premium',planName:'Premium',amount:249900,months:1,status:'PENDING',createdAt:new Date().toISOString(),providerOrderId:'order_browser'};let verified=false,attempts=0;
 await page.route('**/api/client/subscription',async route=>route.fulfill({json:{displayMode:'TEST',subscription:null,testSubscription:verified?{orderId:order.id,planId:'premium',planName:'Premium',months:1,amount:249900,status:'ACTIVE',startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+30*86400000).toISOString(),daysRemaining:30,features:['Certificate insights','Reports'],units:6}:null,history:[],usage:[]}}));
 await page.route('**/api/client/billing/test**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/verify')){attempts++;if(attempts===1){await route.fulfill({status:409,json:{error:'Test payment verification pending. Retry verification.'}});return;}verified=true;await route.fulfill({json:{order:{...order,status:'VERIFIED',paymentId:'pay_browser'}}});return;}
  if(route.request().method()==='POST'){const payload=route.request().postDataJSON();expect(payload.acceptTestMode).toBe(true);expect(payload.months).toBe(1);expect(payload.idempotencyKey).toBeTruthy();await route.fulfill({json:{order,keyId:'rzp_test_browserfixture',amount:order.amount,providerOrderId:order.providerOrderId}});return;}
  await route.fulfill({json:{configured:true,message:'Isolated mocked provider for automated browser testing only.',plans,orders:verified?[{...order,status:'VERIFIED'}]:[]}});
 });
 await page.route('https://checkout.razorpay.com/v1/checkout.js',route=>route.fulfill({contentType:'application/javascript',body:`window.Razorpay=class{constructor(o){this.options=o;}on(){}open(){setTimeout(()=>this.options.handler({razorpay_payment_id:'pay_browser',razorpay_signature:'a'.repeat(64)}),10);}};`}));
 await page.reload();await page.getByRole('button',{name:'Try Premium',exact:true}).click();await page.getByRole('checkbox',{name:'I understand this is a sandbox purchase with no real charges.'}).check();await page.getByRole('button',{name:'Continue to Razorpay Test Checkout',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry verification',exact:true})).toBeVisible();await expect(page.getByText('Test purchase successful',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Retry verification',exact:true}).click();await expect(page.getByText('Test purchase successful',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Test receipt',exact:true})).toBeVisible();
 await expect(page.locator('.sc-current')).toContainText('Premium');await expect(page.locator('.sc-current')).toContainText('Monthly membership');await expect(page.locator('.sc-mode-notch')).toContainText(/Premium.*Monthly/);
 const live=await(await page.request.get('/api/client/billing')).json();expect(live.payments).toHaveLength(0);expect(live.invoices).toHaveLength(0);
 for(const width of [1568,768,390,320]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});
