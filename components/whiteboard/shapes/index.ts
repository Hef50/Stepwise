/**
 * Shape registry for AI-authored tldraw custom shapes.
 *
 * THIS IS THE ONLY FILE that imports from multiple shape util files.
 * Steps 7-10 each own exactly one sibling file. Only this file and
 * Whiteboard.tsx need to be touched when adding a new shape type.
 */

export { TextShapeUtil, AI_TEXT_TYPE } from "./TextShapeUtil";
export { LatexShapeUtil, AI_LATEX_TYPE } from "./LatexShapeUtil";
export { MermaidShapeUtil, AI_MERMAID_TYPE } from "./MermaidShapeUtil";
export { SchemdrawShapeUtil, AI_SCHEMDRAW_TYPE } from "./SchemdrawShapeUtil";

import { TextShapeUtil } from "./TextShapeUtil";
import { LatexShapeUtil } from "./LatexShapeUtil";
import { MermaidShapeUtil } from "./MermaidShapeUtil";
import { SchemdrawShapeUtil } from "./SchemdrawShapeUtil";

export const customShapeUtils = [
  TextShapeUtil,
  LatexShapeUtil,
  MermaidShapeUtil,
  SchemdrawShapeUtil,
] as const;
