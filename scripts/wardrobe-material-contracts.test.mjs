import {test} from "node:test";
import assert from "node:assert/strict";
import {validateWardrobeMaterial} from "./wardrobe-material-contracts.mjs";

test("rejects the actual neutral-brow failure from the first frozen female export",()=>{
  assert.throws(()=>validateWardrobeMaterial("female-brunette-tailored","MI_Hair_1.001",[1,1,1,1]),/untinted/);
});
test("accepts tinted brows/crown and does not mistake eye whites for hair",()=>{
  for(const name of ["Wardrobe_Female_Brunette_Brows","Wardrobe_Female_Brunette_FrontFibers"])
    assert.doesNotThrow(()=>validateWardrobeMaterial("female-brunette-tailored",name,[.045,.021,.011,1]));
  assert.doesNotThrow(()=>validateWardrobeMaterial("female-brunette-tailored","MI_Eyes",[1,1,1,1]));
});
