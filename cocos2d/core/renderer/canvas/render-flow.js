/****************************************************************************
 Copyright (c) 2017-2018 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
 worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
 not use Cocos Creator software for developing other software or tools that's
 used for developing games. You are not granted to publish, distribute,
 sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

import RenderFlow from '../render-flow';

let postFlow = RenderFlow.postFlow;

RenderFlow.prototype._draw = function (node, func) {
    let batcher = RenderFlow.getBachther();
    let ctx = batcher._device._ctx;
    let cam = batcher._camera;
    ctx.setTransform(cam.a, cam.b, cam.c, cam.d, cam.tx, cam.ty);
    ctx.scale(1, -1);

    let comp = node._renderComponent;
    comp._assembler[func](ctx, comp);

    // this._next._func(node);

    let currentFlow = this._next;

    let postCount = postFlow.length;
    while (currentFlow) {
        currentFlow._func(node);
        if (currentFlow === currentFlow._next){
            break
        }
        currentFlow = currentFlow._next;
    }
    for (let _p = postCount, _pl = postFlow.length; _p < _pl; _p++) {
        postFlow.pop()(node);
    }

}

RenderFlow.prototype._render = function (node) {
    this._draw(node, 'draw');
}

RenderFlow.prototype._postRender = function (node) {
    this._draw(node, 'postDraw');
}
