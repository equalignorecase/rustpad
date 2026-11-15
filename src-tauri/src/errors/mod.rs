use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
}
pub type Result<T> = std::result::Result<T, AppError>;
impl AppError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}
impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        let (code, message) = match error.kind() {
            std::io::ErrorKind::PermissionDenied => (
                "permission",
                "Permission denied. Check the file and folder permissions.",
            ),
            std::io::ErrorKind::NotFound => (
                "deleted",
                "The file no longer exists. Use Save As to keep your changes.",
            ),
            _ => (
                "io",
                "The disk operation failed. Your editor contents are still available; check free space and permissions.",
            ),
        };
        Self::new(code, message)
    }
}
