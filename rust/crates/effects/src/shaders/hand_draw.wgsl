struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct EffectUniforms {
    resolution: vec2f,
    direction: vec2f,
    scalars: vec4f,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

fn luminance(color: vec3f) -> f32 {
    return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

fn noise(position: vec2f) -> f32 {
    return fract(sin(dot(position, vec2f(12.9898, 78.233))) * 43758.5453);
}

fn sampled_luminance(uv: vec2f) -> f32 {
    return luminance(textureSample(input_texture, input_sampler, uv).rgb);
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let texel = vec2f(1.0, 1.0) / uniforms.resolution;
    let source = textureSample(input_texture, input_sampler, input.tex_coord);
    let progress = clamp(uniforms.scalars.x, 0.0, 1.0);
    let line_strength = clamp(uniforms.scalars.y, 0.0, 1.0);
    let color_delay = clamp(uniforms.scalars.z, 0.0, 0.9);
    let roughness = clamp(uniforms.scalars.w, 0.0, 1.0);

    let left = sampled_luminance(input.tex_coord - vec2f(texel.x, 0.0));
    let right = sampled_luminance(input.tex_coord + vec2f(texel.x, 0.0));
    let top = sampled_luminance(input.tex_coord - vec2f(0.0, texel.y));
    let bottom = sampled_luminance(input.tex_coord + vec2f(0.0, texel.y));
    let top_left = sampled_luminance(input.tex_coord - texel);
    let top_right = sampled_luminance(input.tex_coord + vec2f(texel.x, -texel.y));
    let bottom_left = sampled_luminance(input.tex_coord + vec2f(-texel.x, texel.y));
    let bottom_right = sampled_luminance(input.tex_coord + texel);
    let gradient_x = -top_left - 2.0 * left - bottom_left + top_right + 2.0 * right + bottom_right;
    let gradient_y = -top_left - 2.0 * top - top_right + bottom_left + 2.0 * bottom + bottom_right;
    let edge = length(vec2f(gradient_x, gradient_y));
    let pencil = smoothstep(0.08, 0.50, edge) * line_strength;

    let grain = noise(floor(input.tex_coord * uniforms.resolution * 0.5));
    let paper = vec3f(0.965, 0.948, 0.905) + vec3f((grain - 0.5) * 0.035);
    let graphite = vec3f(0.09, 0.11, 0.14);
    let sketch = mix(paper, graphite, pencil);
    let colored = mix(source.rgb, graphite, pencil * 0.35);

    let tile = floor(input.tex_coord * vec2f(36.0, 24.0));
    let draw_order = clamp(input.tex_coord.x * 0.73 + input.tex_coord.y * 0.14 + noise(tile) * 0.20, 0.0, 1.0);
    let reveal_softness = mix(0.035, 0.15, roughness);
    let revealed = smoothstep(draw_order - reveal_softness, draw_order + reveal_softness, progress);
    let color_progress = smoothstep(color_delay, min(color_delay + 0.34, 1.0), progress);
    let drawn = mix(sketch, colored, color_progress);

    return vec4f(mix(paper, drawn, revealed), source.a);
}
