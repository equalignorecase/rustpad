use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub name: String,
    pub path: Option<String>,
    pub content: String,
    pub fingerprint: String,
    pub line_ending: String,
    pub bom: bool,
    pub encoding: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTab {
    pub path: String,
    #[serde(default)]
    pub cursor: usize,
    #[serde(default)]
    pub scroll: f64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    pub version: u8,
    pub settings: serde_json::Value,
    pub recent: Vec<String>,
    pub tabs: Vec<SessionTab>,
    pub active: Option<String>,
}
