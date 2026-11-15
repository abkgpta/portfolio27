"""Skill vocabulary for the weightage system. One entry per data-skills tag used in
index.html and pdf/index.html. Keywords are matched (lower case, word-ish) against a
studio's research text to estimate how much that studio asks for the skill."""
SKILLS = {
    "sketching":   ["sketch", "hand drawing", "drawing", "ideation", "concept development", "form design", "form-giving", "storyboard"],
    "cad":         ["cad", "rhino", "solidworks", "creo", "fusion 360", "plasticity", "alias", "nx", "catia", "surfacing", "surface model", "3d model", "keyshot", "onshape"],
    "rendering":   ["render", "visuali", "cgi", "keyshot", "v-ray", "vray", "blender", "cinema 4d", "c4d", "unreal", "motion", "animation", "photoreal", "image making"],
    "cmf":         ["cmf", "colour", "color", "material", "finish", "texture", "textile", "trend"],
    "prototyping": ["prototyp", "mock-up", "mockup", "model making", "model-making", "workshop", "3d print", "3d-print", "maker", "hands-on", "working model", "craft"],
    "electronics": ["electronic", "hardware", "consumer tech", "wearable", "audio", "sensor", "iot", "connected", "device", "headphone", "speaker", "medical", "robot", "smart"],
    "interaction": ["interaction", "ux", "user experience", "usability", "human factors", "ergonom", "hmi", "interface", "experience design", "service design"],
    "ui":          ["ui", "ui/ux", "figma", "screen", "app ", "digital", "software", "gui"],
    "research":    ["research", "insight", "user stud", "ethnograph", "strategy", "foresight", "innovation", "human-centred", "human-centered", "design thinking"],
    "systems":     ["system", "modular", "platform", "range", "family", "circular", "sustainab", "repair", "lifecycle", "recycl"],
    "branding":    ["brand", "identity", "graphic", "logo", "typograph", "communication", "campaign"],
    "packaging":   ["packaging", "pack ", "retail", "point of sale", "unboxing", "fmcg"],
}
