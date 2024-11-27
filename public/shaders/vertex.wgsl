// @location() attribute and type that match what you described in the vertexBufferLayout

@vertex
fn vertexMain(
    @location(0) pos: vec2f
) -> @builtin(position) vec4f {
    // If we just want to pass x to x and y to y, we cand do this:
    // return vec4f(pos.x, pos.y, 0, 1); // (X, Y, Z, W)
    // optionally, you can pass the vec2 as the first part of the vec4 and it knows what to do!
    return vec4f(pos, 0, 1);
}