import { COLS, HIDDEN_ROWS, ROWS, SEQUENCE_STEPS, VISIBLE_ROWS } from "./types";
import type { PieceId } from "./types";
import type { TetrisEngine } from "./engine";
import { cellsOf, PIECE_IDS } from "./pieces";

export function rowToStep(row:number){const visible=row-HIDDEN_ROWS;if(visible<VISIBLE_ROWS-SEQUENCE_STEPS)return null;if(visible<0||visible>=VISIBLE_ROWS)return null;return VISIBLE_ROWS-1-visible;}
export function stepToRow(step:number){const visible=VISIBLE_ROWS-1-step;return visible+HIDDEN_ROWS;}
export type MixCell={col:number;step:number;type:PieceId};
export function analyze(engine:TetrisEngine){
  const cells:MixCell[]=[];let stackHeight=0;
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const cell=engine.grid[y]![x];if(!cell)continue;const vis=engine.visibleRow(y);if(vis>=0)stackHeight=Math.max(stackHeight,VISIBLE_ROWS-vis);const step=rowToStep(y);if(step==null)continue;cells.push({col:x,step,type:cell.type});}
  let falling:{type:PieceId;cells:MixCell[]}|null=null;
  if(engine.active){const fcells:MixCell[]=[];const gy=engine.ghostY();for(const[cx,cy]of cellsOf(engine.active.type,engine.active.rot)){const col=engine.active.x+cx!;const step=rowToStep(gy+cy!);if(step==null)continue;fcells.push({col,step,type:engine.active.type});}falling={type:engine.active.type,cells:fcells};}
  return{stackHeight,cells,falling};
}
export function cellsOnStep(cells:MixCell[],step:number){return cells.filter(c=>c.step===step);}
export{PIECE_IDS};
