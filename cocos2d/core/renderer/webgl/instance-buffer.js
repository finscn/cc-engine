

let instanceBuffer;
let vbuf;
let bufferIdx = 0;

let instanceData = null; // 全局的数据buffer，用它变图// 只有提交用这个
let instanceFloat32Data = null; // 数据管理用这个 // 和上面那个的data实际上是一个data
let instanceDataDirty = false;

let resizeDirty = false;

let instanceTexture = null; // 图
let instanceDataTexOptions = null; // 图信息

let SUPPORT_FLOAT_TEXTURE = false; //拓展支持查询
let size = 64;//初始宽高

// 同时用于索引分配和可用索引记录
let fixLength = 0; // 长度记录
let freeIndexBuffer = []; // 可用索引记录

function checkFloatSupport () {
    SUPPORT_FLOAT_TEXTURE = !!cc.sys.glExtension('OES_texture_float');
}

export function initFreeIndexBuffer () {
    if (fixLength === 0) {
        // 拓展检查
        checkFloatSupport();
        //初始化索引数组
        freeIndexBuffer.length = fixLength = SUPPORT_FLOAT_TEXTURE ? size * size / 4 : size * size / 16;
        for(let i = 0; i < freeIndexBuffer.length; i++ ) {
            freeIndexBuffer[i] = i;
        }
        //初始化数据数组
        initBuffer();
    } else if (freeIndexBuffer.length === 0) {
        // resize 索引数组 及 数据数组
        resizeDataBuffer();
        // instanceDataDirty = true;
    }
}

//重新缩放所有的buffer，包括存 data 那个，包括索引这个，包括图
function resizeDataBuffer () {
    // 此时需要重新分配了吧 // 同时也意味着 buffer 也放不下了，图也放不下了
    // resize
    size *= 2;
    freeIndexBuffer.length = (SUPPORT_FLOAT_TEXTURE ? size * size / 4 : size * size / 16) - fixLength;
    for(let i = 0; i < freeIndexBuffer.length; i++ ) {
        freeIndexBuffer[i] = i + fixLength;
    }
    fixLength = freeIndexBuffer.length + fixLength;

    // resize buffer
    let buffer = new Float32Array(size * size * 4);
    buffer.set(instanceFloat32Data);
    instanceData = instanceFloat32Data = buffer;
    if(!SUPPORT_FLOAT_TEXTURE) {
        instanceData = new Uint8Array(instanceFloat32Data.buffer);
    }

    // resizeTexture // 需要重新initWithData 还是直接更新 instanceDataTexOptions？
    // instanceDataTexOptions.width = SUPPORT_FLOAT_TEXTURE ? size : size * 4;
    // instanceDataTexOptions.height = size;
    // instanceDataTexOptions.images[0] = instanceData;
    initTexture(SUPPORT_FLOAT_TEXTURE);
}

export function getDataIndex () {
    return freeIndexBuffer.shift();
}

export function releaseDataIndex (index) {
    freeIndexBuffer.unshift(index);
}

// instanceArray 结构体
export const vfmtInstance = new cc.gfx.VertexFormat([
    { name: 'a_block_idx', type: cc.gfx.ATTR_TYPE_FLOAT32, num: 1 },
])

// data 结构 // 配合在 shader 中解析
export const vfmtDataBuffer = new cc.gfx.VertexFormat([
    { name: 'a_uv_matrix', type: cc.gfx.ATTR_TYPE_FLOAT32, num: 4 },
    { name: 'a_pos_local', type: cc.gfx.ATTR_TYPE_FLOAT32, num: 4 },
    { name: 'a_pos_rotate_scale', type: cc.gfx.ATTR_TYPE_FLOAT32, num: 4 },
    { name: 'a_pos_translate', type: cc.gfx.ATTR_TYPE_FLOAT32, num: 2 },
    { name: 'a_uv_rotate', type: cc.gfx.ATTR_TYPE_FLOAT32, num: 1 },
    { name: 'a_texture_id', type: cc.gfx.ATTR_TYPE_FLOAT32, num: 1 },
])

// resize 和生命周期的管理，可以在一起
// init 和 getBuffer 可以在一起
export function initBuffer () {

    if (!instanceData) {
        instanceData = instanceFloat32Data = new Float32Array(size * size * 4); //w x h x 4(RGBA)
        if(!SUPPORT_FLOAT_TEXTURE) {
            instanceData = new Uint8Array(instanceFloat32Data.buffer);
        }
        // 初始化的时候绑定就行，之后只需要更新（_commitJointsData）
        initTexture(SUPPORT_FLOAT_TEXTURE);
    }
}

function initTexture (IsFloatTexture) {
    // 需要更新机制，而且每帧更一次就行了 在 model-batcher 中
    // 没变就不更新 有 dirty
    let pixelFormat = cc.Texture2D.PixelFormat.RGBA32F,
    width = size,
    height = size;
    if (!IsFloatTexture) {
        pixelFormat = cc.Texture2D.PixelFormat.RGBA8888;
        width *= 4;
    }
    let texture = instanceTexture || new cc.Texture2D();
    let NEAREST = cc.Texture2D.Filter.NEAREST;
    texture.setFilters(NEAREST, NEAREST);
    texture.initWithData(instanceData, pixelFormat, width, height);
    instanceTexture = texture; // 最后提交用这个 instanceTexture
    instanceDataTexOptions = {
        format: pixelFormat,
        width: texture.width,
        height: texture.height,
        images: []
    };
    instanceDataTexOptions.images[0] = instanceData;
    setResizeDirty(true);
}

export function getInstanceTexture () {
    return instanceTexture;
}

export function commitInstanceData () {
    if (instanceTexture) {
        instanceTexture.update(instanceDataTexOptions);
    }
}

export function getInstanceDataDirty () {
    return instanceDataDirty;
}

export function setInstanceDataDirty (value) {
    instanceDataDirty = value;
}

export function getResizeDirty () {
    return resizeDirty;
}

export function setResizeDirty (value) {
    resizeDirty = value;
}

let FixedRequestCount = 2000;

export function getBuffer () {
    if (!instanceBuffer) {
        instanceBuffer = cc.renderer._handle.getBuffer('mesh', vfmtInstance);
        instanceBuffer.request(FixedRequestCount, 0);
        instanceBuffer.instanceOffset = 0;
        instanceBuffer.instanceStart = 0;
        
        let _originReset = instanceBuffer.reset;
        instanceBuffer.reset = function () {
            _originReset.call(this);

            this.request(FixedRequestCount, 0);
            
            this.instanceOffset = 0;
            this.instanceStart = 0;
        }
        instanceBuffer.isInstance = true;
        instanceBuffer.instanceCount = function () {
            return bufferIdx;
        }
        instanceBuffer.forwardIndiceStartToOffset = function () {
            this.uploadData();

            // this.instanceStart = this.instanceOffset;
            this.instanceStart = 0;
            this.instanceOffset = 0;

            this.switchBuffer();
            this.request(FixedRequestCount, 0);
        }

        vbuf = instanceBuffer._vData;
    }
    if ((instanceBuffer.instanceOffset + 1) === FixedRequestCount) {
        FixedRequestCount *= 2;
        instanceBuffer.request(FixedRequestCount, 0);
    }
    return instanceBuffer;
}

export function getVBuffer () {
    return instanceBuffer._vData;
}

export function getDataBuffer () {
    initBuffer ();
    return instanceData;
}

export function getFloat32DataBuffer () {
    initBuffer ();
    return instanceFloat32Data;
}