
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    Hi
  </div>
`

const GRID_SIZE = 32;

// const shaders =
//     await Promise.all([
//         fetch("./shaders/cellShader.wgsl")
//     ]);

// const cellShader = await shaders[0].text();

import vertexShader from "./shaders/vertex.wgsl?raw"; // this is vite specific import stuff
import fragmentShader from "./shaders/fragment.wgsl?raw"; // this is vite specific import stuff


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
        clearValue: { r: 0.25, g: 0.75, b: 0.4, a: 1 },
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

// The render pipeline controls how geometry is drawn, including things like which shaders are used, how to interpret data in vertex buffers, which kind of geometry should be rendered (lines, points, triangles...)
const cellPipeline: GPURenderPipeline = device.createRenderPipeline({
    label: "Cell pipeline",
    layout: "auto",
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





// Create a uniform buffer that describes the grid.
const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer: GPUBuffer = device.createBuffer({
    label: "Grid Uniforms",
    size: uniformArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

// getBindGroupLayout(0), where the 0 corresponds to the @group(0) that you typed in the vertex shader.
const bindGroup: GPUBindGroup = device.createBindGroup({
    label: "Cell renderer bind group",
    layout: cellPipeline.getBindGroupLayout(0),
    entries: [{
        binding: 0,
        resource: { buffer: uniformBuffer }
    }],
});




renderPass.setPipeline(cellPipeline);
renderPass.setVertexBuffer(0, vertexBuffer);

// The 0 passed as the first argument corresponds to the @group(0) in the shader code. 
// You're saying that each @binding that's part of @group(0) uses the resources in this bind group
renderPass.setBindGroup(0, bindGroup);

// renderPass.draw(vertices.length / 2); // 6 vertices
// This tells the system that you want it to draw the six (vertices.length / 2) vertices of your square 16 (GRID_SIZE * GRID_SIZE) times
// renderPass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE); - but this will just show what looks like one square on the screen 
renderPass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE /* instance count - which will translate to an instance_index in the vertex shader */);
// This supplies WebGPU with all the information necessary to draw your square. 
// First, you use setPipeline() to indicate which pipeline should be used to draw with. 
// This includes the shaders that are used, the layout of the vertex data, and other relevant state data.

// Next, you call setVertexBuffer() with the buffer containing the vertices for your square. 
// You call it with 0 because this buffer corresponds to the 0th element in the current pipeline's vertex.buffers definition.

// draw() takes the number of vertices to render

renderPass.end();

// It's important to know that simply making these calls does not cause the GPU to actually do anything. They're just recording commands for the GPU to do later.``

// In order to create a GPUCommandBuffer, call finish() on the command encoder. The command buffer is an opaque handle to the recorded commands.
const commandBuffer = encoder.finish();

// The queue performs all GPU commands, ensuring that their execution is well ordered and properly synchronized. 
// The queue's submit() method takes in an array of command buffers
// Once you submit a command buffer, it cannot be used again, so there's no need to hold on to it. 
device.queue.submit([commandBuffer]);

// If you want to submit more commands, you need to build another command buffer.
// That's why it's fairly common to see those two steps collapsed into one like this:
// device.queue.submit([encoder.finish()]);

