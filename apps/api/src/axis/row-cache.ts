import type { AxisRow } from "./parser.js";
// Published chunks are immutable. Cache only their source rows, never permissions
// or tenant membership. Metadata and expiry are checked again on every request.
export class PublishedRowCache {
  private entries = new Map<string, { promise: Promise<AxisRow[]>; rows: number; timer?: ReturnType<typeof setTimeout> }>();
  constructor(private ttl = 30000, private maxRows = 200000, private maxEntries = 4) {}
  invalidate(id: string) {
    const entry=this.entries.get(id);if(entry?.timer)clearTimeout(entry.timer);
    this.entries.delete(id);
  }
  read(id: string, load: () => Promise<AxisRow[]>): Promise<AxisRow[]> {
    const current=this.entries.get(id);if(current)return current.promise;
    while(this.entries.size >= this.maxEntries)this.invalidate(this.entries.keys().next().value!);
    const entry: {promise:Promise<AxisRow[]>;rows:number;timer?:ReturnType<typeof setTimeout>}={promise:Promise.resolve([]),rows:0};
    entry.promise=load().then(rows=>{
      if(this.entries.get(id)!==entry)return rows;
      if(rows.length>this.maxRows){this.invalidate(id);return rows;}
      entry.rows=rows.length;
      while([...this.entries.values()].reduce((n,e)=>n+e.rows,0)>this.maxRows)this.invalidate(this.entries.keys().next().value!);
      if(this.entries.get(id)===entry){entry.timer=setTimeout(()=>this.invalidate(id),this.ttl);entry.timer.unref?.();}
      return rows;
    }).catch(error=>{if(this.entries.get(id)===entry)this.invalidate(id);throw error;});
    this.entries.set(id,entry);return entry.promise;
  }
}
