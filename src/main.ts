
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    Hi
  </div>
`

const GRID_SIZE = 32;
const WORKGROUP_SIZE = 8;

// const shaders =
//     await Promise.all([
//         fetch("./shaders/cellShader.wgsl")
//     ]);

// const cellShader = await shaders[0].text();

import vertexShader from "./shaders/vertex.wgsl?raw"; // this is vite specific import stuff
import fragmentShader from "./shaders/fragment.wgsl?raw"; // this is vite specific import stuff
import computeShader from "./shaders/compute.wgsl?raw"; // this is vite specific import stuff


const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;

if (!navigator.gpu) {
    console.error("WebGPU not supported on this browser.");
    throw new Error("WebGPU not supported on this browser.");
} else {
    console.log("WebGPU supported on this browser. Yay!");
}

// an adapter as WebGPU's representation of a specific piece of GPU hardware in your device.
// Most of the time it's OK to simply let the browser pick a default adapter, as you do here, 
// but for more advanced needs there are arguments that can be passed to requestAdapter() 
// that specify whether you want to use low-power or high-performance hardware on devices with multiple GPUs (like some laptops).
const adapter: GPUAdapter | null = await navigator.gpu.requestAdapter();
if (!adapter) {
    console.error("No appropriate GPUAdapter found.");
    throw new Error("No appropriate GPUAdapter found.");
} else {
    console.log("GPUAdapter found. Yay!");
}

// Once you have an adapter, the last step before you can start working with the GPU is to request a GPUDevice. 
// The device is the main interface through which most interaction with the GPU happens.
// As with requestAdapter(), there are options that can be passed here for more advanced uses 
// like enabling specific hardware features or requesting higher limits, but for your purposes the defaults work just fine.
const device: GPUDevice = await adapter.requestDevice();

const context = canvas.getContext("webgpu")!;
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
    device: device,
    format: canvasFormat,
});

// In order to do that—or pretty much anything else in WebGPU—you need to provide some commands to the GPU instructing it what to do.
// To do this, have the device create a GPUCommandEncoder, which provides an interface for recording GPU commands.
const encoder: GPUCommandEncoder = device.createCommandEncoder();

// The commands you want to send to the GPU are related to rendering (in this case, clearing the canvas), 
// so the next step is to use the encoder to begin a Render Pass.
const renderPass = encoder.beginRenderPass({
    colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        // A loadOp value of "clear" indicates that you want the texture to be cleared when the render pass starts.
        loadOp: "clear",
        // The clearValue instructs the render pass which color it should use when performing the clear operation at the beginning of the pass. 
        // The dictionary passed into it contains four values: r for red, g for green, b for blue, and a for alpha (transparency). 
        // Each value can range from 0 to 1, and together they describe the value of that color channel0
        clearValue: { r: 0.0, g: 0.0, b: 0.50196, a: 1 },
        // A storeOp value of "store" indicates that once the render pass is finished you want the results of any drawing done during the render pass saved into the texture.
        storeOp: "store",
    }]
});

// If you want to make a square like this one:
// const vertices = new Float32Array([
// //     X,    Y,
//     -0.8, -0.8,
//      0.8, -0.8,
//      0.8,  0.8,
//     -0.8,  0.8,
// ]);

// You still need to turn it into triangles
const vertices = new Float32Array([
    //     X,    Y,
    -0.8, -0.8, // Triangle 1 (Blue)
    0.8, -0.8,
    0.8, 0.8,

    -0.8, -0.8, // Triangle 2 (Red)
    0.8, 0.8,
    -0.8, 0.8,
]);
// Aside: points are repeated?
// you don't have to:

// Note: You don't have to repeat the vertex data in order to make triangles. 
// Using something called Index Buffers, 
// you can feed a separate list of values to the GPU that tells it what vertices to connect together into triangles 
// so that they don't need to be duplicated. 
// It's like connect-the-dots! Because your vertex data is so simple, 
// using Index Buffers is out of scope for this Codelab. 
// But they're definitely something that you might want to make use of for more complex geometry.

// Need to create a separate buffer for the GPU instead of regular JS arrays
const vertexBuffer: GPUBuffer = device.createBuffer({
    label: "Cell vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

// now need to copy our data into the buffer
device.queue.writeBuffer(vertexBuffer, 0, vertices);

// Now we tell WebGPU about the layout of the data in the buffer
const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 8, // This is the number of bytes the GPU needs to skip forward in the buffer when it's looking for the next vertex
    attributes: [{ // Attributes are the individual pieces of information encoded into each vertex
        format: "float32x2",
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader - It links this attribute to a particular input in the vertex shader - between 0 and 15
    }],
};

// We tell the GPU how to process the data with Shaders
const cellShaderModule: GPUShaderModule = device.createShaderModule({
    label: "Cell shader",
    code: `${vertexShader}\n${fragmentShader}`
});
//Note: You can also create a separate shader module for your vertex and fragment shaders, if you want. 
// That can be beneficial if, for example, you want to use several different fragment shaders with the same vertex shader.


const simulationShaderModule = device.createShaderModule({
    label: "Game of life simulation shader",
    code: `${computeShader}`
});




// Create a uniform buffer that describes the grid.
const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer: GPUBuffer = device.createBuffer({
    label: "Grid Uniforms",
    size: uniformArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

device.queue.writeBuffer(uniformBuffer, 0, uniformArray);


// active state of each cell
const cellState = new Uint32Array(GRID_SIZE * GRID_SIZE);

// storage buffer - two for ping-pong pattern
const cellStateStorage: Array<GPUBuffer> = [
    device.createBuffer({
        label: "Cell State A",
        size: cellState.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, // this is what makes it a storage buffer
    }),
    device.createBuffer({
        label: "Cell State B",
        size: cellState.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
];

// Mark every third cell of the grid as active.
for (let i = 0; i < cellState.length; i += 3) {
    cellState[i] = 1;
}
// once written to the buffer, its in the GPU memory, so we can reuse the cellState array once written
device.queue.writeBuffer(cellStateStorage[0], 0, cellState);

// Mark every other cell of the second grid as active.
for (let i = 0; i < cellState.length; i++) {
    cellState[i] = i % 2;
}
device.queue.writeBuffer(cellStateStorage[1], 0, cellState);


const bindGroupLayout = device.createBindGroupLayout({
    label: "Cell bind group layout",
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
        buffer: {} // Grid uniform buffer
    }, {
        binding: 1, // Make sure that the binding of the new entry matches the @binding() of the corresponding value in the shader!
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage", } // Cell state input buffer
    }, {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" } // Cell state output buffer
    }]
});








// A pipeline layout is a list of bind group layouts (in this case, you have one) that one or more pipelines use. 
// The order of the bind group layouts in the array needs to correspond with the @group attributes in the shaders. 
// (This means that bindGroupLayout is associated with @group(0).)
const pipelineLayout = device.createPipelineLayout({
    label: "Cell Pipeline Layout",
    bindGroupLayouts: [bindGroupLayout],
});


// The render pipeline controls how geometry is drawn, including things like which shaders are used, how to interpret data in vertex buffers, which kind of geometry should be rendered (lines, points, triangles...)
const cellPipeline: GPURenderPipeline = device.createRenderPipeline({
    label: "Cell pipeline",
    layout: pipelineLayout,
    vertex: {
        module: cellShaderModule,
        entryPoint: "vertexMain",
        buffers: [vertexBufferLayout]
    },
    fragment: {
        module: cellShaderModule,
        entryPoint: "fragmentMain",
        targets: [{
            format: canvasFormat
        }]
    }
});


// Create a compute pipeline that updates the game state.
const simulationPipeline: GPUComputePipeline = device.createComputePipeline({
    label: "simulation pipeline",
    layout: pipelineLayout,
    compute: {
        module: simulationShaderModule,
        entryPoint: "computeMain",
    }
});


// getBindGroupLayout(0), where the 0 corresponds to the @group(0) that you typed in the vertex shader.
const bindGroups: Array<GPUBindGroup> = [
    device.createBindGroup({
        label: "Cell renderer bind group A",
        layout: cellPipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: uniformBuffer }
        }, {
            binding: 1, // Make sure that the binding of the new entry matches the @binding() of the corresponding value in the shader!
            resource: { buffer: cellStateStorage[0] }
        }, {
            binding: 2,
            resource: { buffer: cellStateStorage[1] }
        }],
    }),
    device.createBindGroup({
        label: "Cell renderer bind group B",
        layout: cellPipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: uniformBuffer }
        }, {
            binding: 1, // Make sure that the binding of the new entry matches the @binding() of the corresponding value in the shader!
            resource: { buffer: cellStateStorage[1] }
        }, {
            binding: 2,
            resource: { buffer: cellStateStorage[0] }
        }],
    }),
];

const UPDATE_INTERVAL = 400; // Update every 200ms (5 times/sec)
let step = 0; // Track how many simulation steps have been run


// Move all of our rendering code into a function
function updateGrid() {
    const encoder = device.createCommandEncoder();

    // start compute pass
    const computePass = encoder.beginComputePass();

    computePass.setPipeline(simulationPipeline);
    computePass.setBindGroup(0, bindGroups[step % 2]);

    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

    computePass.end();

    step++; // Increment the step count

    // Start a render pass 
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: { r: 0, g: 0, b: 0.4, a: 1.0 },
            storeOp: "store",
        }]
    });

    // Draw the grid.
    pass.setPipeline(cellPipeline);
    pass.setBindGroup(0, bindGroups[step % 2]);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);

    // End the render pass and submit the command buffer
    pass.end();
    device.queue.submit([encoder.finish()]);
}

// Schedule updateGrid() to run repeatedly
setInterval(updateGrid, UPDATE_INTERVAL);
