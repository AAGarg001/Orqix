import mongoose from "mongoose";
import {createHash} from "node:crypto";
import {packedChunkPipeline,decodeChunks} from "./chunk-codec.experiment.js";
await mongoose.connect(process.env.MONGODB_URI!,{serverSelectionTimeoutMS:15000});
const db=mongoose.connection.db!;const u=await db.collection("users").findOne({email:"uflex@orqix.local"});const m=await db.collection("organizationmembers").findOne({userId:u!.id,status:"ACTIVE"});const d=await db.collection("axisdatasets").findOne({tenantId:m!.tenantId,status:"PUBLISHED"});
const t=performance.now();const raw=await db.collection("axischunks").find({datasetId:d!.id}).sort({index:1}).toArray();const rawMs=Math.round(performance.now()-t);
const p=performance.now();const packed=await db.collection("axischunks").aggregate(packedChunkPipeline(d!.id)).toArray();const packedMs=Math.round(performance.now()-p);
const a=raw.flatMap(c=>c.rows);const b=decodeChunks(packed as any);const hash=(x:any)=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
console.log(JSON.stringify({rawMs,packedMs,rawBytes:Buffer.byteLength(JSON.stringify(raw)),packedBytes:Buffer.byteLength(JSON.stringify(packed)),rows:a.length,identical:hash(a)===hash(b)}));await mongoose.disconnect();
