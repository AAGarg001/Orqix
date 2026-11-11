import {describe,it,expect,vi} from 'vitest';
import mongoose from 'mongoose';
import {Store,type Job} from './store.js';
const job:Job={id:'job-1',userId:'owner',assignmentId:'assignment',kind:'extract',name:'Private entity',mode:'all',status:'completed',stage:'Private details',records:123,sections:[{name:'Wallet',status:'Success',records:123}],events:[{sequence:1,time:'now',message:'Sensitive details'}],artifact:true,downloadName:'Private Entity.xlsx',createdAt:'2026-11-03T00:00:00Z',updatedAt:'2026-11-03T01:00:00Z'};
describe('minimal extraction retention',()=>{
  it('writes only identity and time/status metadata to MongoDB while retaining live state only in memory',async()=>{
    const write=vi.spyOn(mongoose.models.Job,'replaceOne').mockResolvedValue({} as any);
    try {
      const store=new Store(false);
      await store.saveJob(job);
      const saved=write.mock.calls[0][1] as any;
      expect(Object.keys(saved).sort()).toEqual(['id','userId','assignmentId','kind','name','createdAt','updatedAt','status'].sort());
      expect(JSON.stringify(saved)).not.toContain('Private');
      expect((await store.job(job.id))?.records).toBe(123);
    }finally{write.mockRestore();}
  });
  it('counts each retry separately without exposing rows, modules, filenames or logs in history',async()=>{
    const store=new Store(true);
    await store.saveJob({...job,status:'ready'});
    await store.saveJob({...job,status:'running'});
    await store.saveJob({...job,status:'partial'});
    await store.saveJob({...job,status:'ready'});
    await store.saveJob({...job,status:'running'});
    await store.saveJob({...job,status:'completed'});
    const history=await store.extractionHistory('owner');
    expect(history).toHaveLength(2);
    expect(history.map(r=>r.status)).toEqual(['completed','partial']);
    expect(await store.extractionHistory('other')).toHaveLength(0);
    expect(JSON.stringify(history)).not.toMatch(/records|sections|downloadName|Private/);
  });
});
