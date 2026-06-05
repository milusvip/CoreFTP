use std::collections::HashSet;
use std::sync::Mutex;

/// 传输任务取消注册表
pub struct CancelRegistry {
    ids: Mutex<HashSet<String>>,
}

impl CancelRegistry {
    pub fn new() -> Self {
        CancelRegistry {
            ids: Mutex::new(HashSet::new()),
        }
    }

    pub fn request_cancel(&self, task_id: &str) {
        self.ids.lock().unwrap().insert(task_id.to_string());
    }

    pub fn is_cancelled(&self, task_id: &str) -> bool {
        self.ids.lock().unwrap().contains(task_id)
    }

    pub fn clear(&self, task_id: &str) {
        self.ids.lock().unwrap().remove(task_id);
    }
}
