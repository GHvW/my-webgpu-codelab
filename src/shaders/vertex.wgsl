// @location() attribute and type that match what you described in the vertexBufferLayout


struct VertexInput {
    @location(0) pos: vec2f,
    @builtin(instance_index) instance: u32,
}

struct VertexOutput {
    @builtin(position) pos: vec4f,
}

// This defines a uniform in your shader called grid, 
// which is a 2D float vector that matches the array that you just copied into the **uniform buffer**.
// elsewhere in the shader code, you can use the grid vector however you need
@group(0) @binding(0) var<uniform> grid: vec2f;


// Part 5 vertex shader - manipulation
@vertex
fn vertexMain(
    input: VertexInput
) -> VertexOutput {

    let i = f32(instance);
    // Compute the cell coordinate from the instance_index
    let cell = vec2f(i % grid.x, floor(i / grid.x));

    let cellOffset = cell / grid * 2;
    let gridPos = (pos + 1) / grid - 1 + cellOffset;

    var vertexOutput: VertexOutput;
    output.pos = vec4f(gridPos, 0, 1);
    return output;
}

// Part 5 vertex shader
// @vertex
// fn vertexMain(
//     @location(0) pos: vec2f
// ) -> @builtin(position) vec4f {
//     // Since pos is a 2D vector and grid is a 2D vector, WGSL performs a component-wise division. 
//     // In other words, the result is the same as saying vec2f(pos.x / grid.x, pos.y / grid.y).
//     return vec4f(pos / grid, 0, 1);
// }

// Pre part 5 vertex shader
// @vertex
// fn vertexMain(
//     @location(0) pos: vec2f
// ) -> @builtin(position) vec4f {
//     // If we just want to pass x to x and y to y, we cand do this:
//     // return vec4f(pos.x, pos.y, 0, 1); // (X, Y, Z, W)
//     // optionally, you can pass the vec2 as the first part of the vec4 and it knows what to do!
//     return vec4f(pos, 0, 1);
// }