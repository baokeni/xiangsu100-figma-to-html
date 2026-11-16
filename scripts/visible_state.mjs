/** Executed in the page for explicitly checked elements, never every scroll item. */
export function inspectVisibleState(element,{wholeElement=false}={}){
  const issues=[],rect=element.getBoundingClientRect(),style=getComputedStyle(element);
  let opacity=1,clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
  for(let parent=element;parent;parent=parent.parentElement){
    const css=getComputedStyle(parent);opacity*=Number(css.opacity);
    const box=parent.getBoundingClientRect();
    if(/hidden|clip|scroll|auto/.test(css.overflowX)){clip.left=Math.max(clip.left,box.left+parent.clientLeft);clip.right=Math.min(clip.right,box.left+parent.clientLeft+parent.clientWidth);}
    if(/hidden|clip|scroll|auto/.test(css.overflowY)){clip.top=Math.max(clip.top,box.top+parent.clientTop);clip.bottom=Math.min(clip.bottom,box.top+parent.clientTop+parent.clientHeight);}
  }
  if(opacity<=0)issues.push('zero-effective-opacity');
  if(style.visibility!=='visible')issues.push('visibility-'+style.visibility);
  const inside=box=>box.width>0&&box.height>0&&box.left>=clip.left-1&&box.top>=clip.top-1&&box.right<=clip.right+1&&box.bottom<=clip.bottom+1;
  if(wholeElement&&!inside(rect))issues.push('element-clipped-or-outside-viewport');
  const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node,textNodes=0;
  while((node=walker.nextNode())){
    if(!node.textContent.trim())continue;
    textNodes++;const parent=node.parentElement,css=getComputedStyle(parent),range=document.createRange();range.selectNodeContents(node);
    const boxes=[...range.getClientRects()].filter(box=>box.width>0&&box.height>0);
    if(!boxes.length||css.visibility!=='visible')issues.push('text-not-rendered');
    if(boxes.some(box=>!inside(box)))issues.push('text-clipped-or-outside-viewport');
    // Nested text can have opacity/overflow different from the checked container.
    let alpha=1,localClip={...clip};
    for(let p=parent;p&&p!==element;p=p.parentElement){const cs=getComputedStyle(p),b=p.getBoundingClientRect();alpha*=Number(cs.opacity);if(/hidden|clip|scroll|auto/.test(cs.overflowX)){localClip.left=Math.max(localClip.left,b.left+p.clientLeft);localClip.right=Math.min(localClip.right,b.left+p.clientLeft+p.clientWidth);}if(/hidden|clip|scroll|auto/.test(cs.overflowY)){localClip.top=Math.max(localClip.top,b.top+p.clientTop);localClip.bottom=Math.min(localClip.bottom,b.top+p.clientTop+p.clientHeight);}}
    if(alpha<=0)issues.push('zero-text-opacity');
    if(boxes.some(b=>b.left<localClip.left-1||b.top<localClip.top-1||b.right>localClip.right+1||b.bottom>localClip.bottom+1))issues.push('text-clipped-by-descendant');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');ctx.fillStyle=css.color;ctx.fillRect(0,0,1,1);if(ctx.getImageData(0,0,1,1).data[3]===0)issues.push('transparent-text-color');
  }
  if(!textNodes&&!inside(rect))issues.push('empty-or-clipped-target');
  return {ok:issues.length===0,issues:[...new Set(issues)],effectiveOpacity:opacity,clip,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
}
