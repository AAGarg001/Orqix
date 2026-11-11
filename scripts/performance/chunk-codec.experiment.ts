import type { AxisRow } from "../../apps/api/src/axis/parser.js";
// Dictionary-encode field names only for the MongoDB response. Stored rows and
// their values are unchanged; unusual row shapes carry their own key list.
export function packedChunkPipeline(datasetId: string) {
  const keys = { $map: { input: "$$pairs", as: "pair", in: "$$pair.k" } };
  return [
    {$match:{datasetId}}, {$sort:{index:1}},
    {$project:{_id:0,index:1,rows:1,schemas:{$map:{
      input:{$setUnion:["$rows.kind",[]]},as:"kind",in:{kind:"$$kind",keys:{$map:{
        input:{$objectToArray:{$arrayElemAt:[{$filter:{input:"$rows",as:"row",cond:{$eq:["$$row.kind","$$kind"]}}},0]}},as:"pair",in:"$$pair.k"
      }}}
    }}}},
    {$project:{index:1,schemas:1,rows:{$map:{input:"$rows",as:"row",in:{$let:{
      vars:{pairs:{$objectToArray:"$$row"},schema:{$arrayElemAt:[{$filter:{input:"$schemas",as:"schema",cond:{$eq:["$$schema.kind","$$row.kind"]}}},0]}},
      in:{kind:"$$row.kind",values:{$map:{input:"$$pairs",as:"pair",in:"$$pair.v"}},keys:{$cond:[{$eq:[keys,"$$schema.keys"]},null,keys]}}
    }}}}}}
  ];
}
export type PackedChunk={index:number;schemas:{kind:string;keys:string[]}[];rows:{kind:string;values:unknown[];keys:string[]|null}[]};
export function decodeChunks(chunks:PackedChunk[]):AxisRow[]{
  return chunks.flatMap(chunk=>{
    const schemas=new Map(chunk.schemas.map(s=>[s.kind,s.keys]));
    return chunk.rows.map(row=>{
      const keys=row.keys??schemas.get(row.kind);
      if(!keys||keys.length!==row.values.length)throw Error("Invalid packed source row");
      return Object.fromEntries(keys.map((key,i)=>[key,row.values[i]])) as AxisRow;
    });
  });
}
