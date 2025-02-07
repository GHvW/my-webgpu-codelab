// VertexOutput from vertex.wgsl - but they are a part of the same shader module
// grid from vertex.wgsl
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    return vec4f(input.cell / grid, 0, 1); // (Red, Green, Blue, Alpha)
}