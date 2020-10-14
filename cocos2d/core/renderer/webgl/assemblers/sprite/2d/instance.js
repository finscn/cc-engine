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

import Assembler2D from '../../../../assembler-2d';
import { getBuffer, getVBuffer, vfmtInstance, vfmtDataBuffer, getFloat32DataBuffer, initFreeIndexBuffer, getDataIndex, releaseDataIndex, setInstanceDataDirty, getInstanceTexture, getResizeDirty} from '../../../instance-buffer';

export default class InstanceSpriteAssembler extends Assembler2D {
    verticesCount = 1;
    dataPerVert = vfmtDataBuffer._bytes / 4;
    floatsPerVert = vfmtInstance._bytes / 4;

    instanceDataIndex = -1;
    dataBufferStart = 0;

    constructor () {
        super();
        this.isInstance = true;

        getBuffer();// 这个是初始化 instanceBuffer 的，改完之后只传一个值 InstanceIndex

        // 这个数据，就是需要传给并存在贴图的数据
        // 通过 InstanceIndex 存到 instanceData 中
        // 全部处理完了之后生成图片，上传
        this._instanceArray = new Float32Array(this.floatsPerVert);// 当前组建的instance数据，理论上只有索引一个值 // 可以不用这个数组，直接填一个数字也行
        this._dataBufferArray = new Float32Array(this.dataPerVert);
        // 保存了当前的组件的所有所需的数据 // 在 updateRenderData 中会进行填充并全部更新，在 onlyUpdateWorldVerts 中只会进行世界矩阵的填充变化（注意是当前组件）
    }

    initBlockInfo () {
        if (this.instanceDataIndex === -1) {
            // 初始化并检查 freeIndexBuffer 是否够用 //会初始化数据数组
            initFreeIndexBuffer();

            // 申请索引
            this.instanceDataIndex = getDataIndex();
            this._instanceArray[0] = this.instanceDataIndex;

            // 计算偏移位置 // 这里没有考虑到不是 floatTexture 的情况，转换函数在哪？？
            this.dataBufferStart = this.instanceDataIndex * this.dataPerVert;

            // 有问题，这个能保证在 updateRenderData 之前吗？
            // 申请完了之后可以考虑填充数据
            // 或者在fillBuffer 中填充
            // updateRenderData 中会进行填充

            // 需要 _updateMaterial
            this._updateMaterial();
        }
    }

    releaseBlockInfo () {
        if (this.instanceDataIndex !== -1) {
            releaseDataIndex(this.instanceDataIndex);
            this._dataBufferArray.fill(0);
            let buffer = this.get32fDataBuffer();
            buffer.set(this._dataBufferArray, this.instanceDataIndex * this.dataPerVert);
            this.instanceDataIndex = -1;
            setInstanceDataDirty(true);
        }
    }

    onEnable () {
        super.onEnable();
        this.initBlockInfo();
    }

    onDisable () {
        super.onDisable();
        this.releaseBlockInfo();
    }

    _updateMaterial () {
        let materials = this._renderComp.getMaterials();
        for (let i = 0; i < materials.length; i++) {
            let material = materials[i];
            let texture = this.getDataTexture();
            material.setProperty('instanceDataTexture', texture);
            material.setProperty('instanceDataTextureSize', new Float32Array([texture.width, texture.height]));
            material.define('CC_INSTANCE_TEXTURE_FLOAT32', !!cc.sys.glExtension('OES_texture_float'));
        }
    }

    updateColor () {

    }

    getVfmt () {
        return vfmtInstance;
    }

    getBuffer () {
        return getBuffer();
    }

    getVBuffer () {
        return getVBuffer();
    }

    get32fDataBuffer () {
        return getFloat32DataBuffer();
    }

    getDataTexture () {
        return getInstanceTexture();
    }

    fillBuffers (comp, renderer) { // 此函数每个组件都会调用一次，所以只能在此处更新 buffer
        if (renderer.worldMatDirty) {
            // this.updateWorldVerts(comp); // 此处更新贴图？块？ 更新 buffer
            this.onlyUpdateWorldVerts(comp); // 只更新世界矩阵，会同时更新自己的 buffer 和 总的 buffer
        }

        // 不变也可以不更新 //可以做个dirty // 或者就直接在开关时更新一次就完事
        let instanceBuffer = getBuffer();
        let buffer = this.getVBuffer(); // 系统公用的总的instanceBuffer
        buffer.set(this._instanceArray, instanceBuffer.instanceOffset++ * this.floatsPerVert); // buffer 的写入，不影响，还是在更那个索引，其实更不更吧，这也不变吧

        cc.renderer._handle._buffer = instanceBuffer;// 更新 modelBatcher 中的 instanceBuffer
        if (getResizeDirty()) {
            this._updateMaterial();
        }
    }

    updateWorldVerts (comp) {
        let buffer = this._dataBufferArray;

        let m = comp.node._worldMatrix.m;
        buffer[8] = m[0];
        buffer[9] = m[1];
        buffer[10] = m[4];
        buffer[11] = m[5];
        buffer[12] = m[12];
        buffer[13] = m[13];
    }

    // 只更新世界矩阵（经常变）// 其实是同时更新组件自己的buffer 和 全局的buffer
    onlyUpdateWorldVerts (comp) {
        this.updateWorldVerts (comp);

        let buffer = this.get32fDataBuffer();
        let compBuffer = this._dataBufferArray;

        let m = comp.node._worldMatrix.m;

        // 可能没有处理非 floatTexture 的情况，仔细想想，到底在哪里处理这个情况？所有数据填充？还是提交之前？？
        buffer[this.dataBufferStart + 8] = compBuffer[8] = m[0];
        buffer[this.dataBufferStart + 9] = compBuffer[9] = m[1];
        buffer[this.dataBufferStart + 10] = compBuffer[10] = m[4];
        buffer[this.dataBufferStart + 11] = compBuffer[11] = m[5];
        buffer[this.dataBufferStart + 12] = compBuffer[12] = m[12];
        buffer[this.dataBufferStart + 13] = compBuffer[13] = m[13];

        setInstanceDataDirty(true);
    }

    updateRenderData (sprite) {
        this.packToDynamicAtlas(sprite, sprite._spriteFrame);

        if (sprite._vertsDirty) {
            this.updateUVs(sprite);
            this.updateVerts(sprite);
            // 更新全部的 buffer ，可以认为都变了
            let buffer = this.get32fDataBuffer();
            buffer.set(this._dataBufferArray, this.instanceDataIndex * this.dataPerVert);
            setInstanceDataDirty(true);
            sprite._vertsDirty = false;
        }
    }

    updateUVs (sprite) {
        let uv = sprite._spriteFrame.uv;
        let buffer = this._dataBufferArray;
        buffer[0] = uv[0];
        buffer[1] = uv[1];

        // if (sprite._spriteFrame.isRotated()) {
        //     buffer[2] = uv[3];
        //     buffer[3] = uv[6];
        // }
        // else {
            buffer[2] = uv[6];
            buffer[3] = uv[7];
        // }

        buffer[14] = sprite._spriteFrame.isRotated() ? 1 : 0;

        // texture id
        buffer[15] = 1;
    }

    updateVerts (sprite) {
        let node = sprite.node,
            cw = node.width, ch = node.height,
            appx = node.anchorX * cw, appy = node.anchorY * ch,
            l, b, r, t;
        if (sprite.trim) {
            l = -appx;
            b = -appy;
            r = cw - appx;
            t = ch - appy;
        }
        else {
            let frame = sprite.spriteFrame,
                ow = frame._originalSize.width, oh = frame._originalSize.height,
                rw = frame._rect.width, rh = frame._rect.height,
                offset = frame._offset,
                scaleX = cw / ow, scaleY = ch / oh;
            let trimLeft = offset.x + (ow - rw) / 2;
            let trimRight = offset.x - (ow - rw) / 2;
            let trimBottom = offset.y + (oh - rh) / 2;
            let trimTop = offset.y - (oh - rh) / 2;
            l = trimLeft * scaleX - appx;
            b = trimBottom * scaleY - appy;
            r = cw + trimRight * scaleX - appx;
            t = ch + trimTop * scaleY - appy;
        }

        let buffer = this._dataBufferArray;
        buffer[4] = l;
        buffer[5] = b;
        buffer[6] = r;
        buffer[7] = t;
        this.updateWorldVerts(sprite);
    }
}
