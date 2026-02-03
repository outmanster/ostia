use std::collections::HashMap;

#[derive(Debug, Clone)]
pub enum RelayMode {
    Hybrid,
    Exclusive,
}

pub struct RelayManager {
    mode: RelayMode,
    default_relays: Vec<String>,
    custom_relays: Vec<String>,
    relay_status: HashMap<String, RelayStatus>,
}

#[derive(Debug, Clone)]
pub enum RelayStatus {
    Connected,
    Connecting,
    Disconnected,
    Failed(String),
}

impl RelayManager {
    pub fn new() -> Self {
        Self {
            mode: RelayMode::Exclusive,  // 默认为独占模式，只使用用户添加的中继器
            default_relays: vec![],      // 完全移除内置中继器
            custom_relays: Vec::new(),
            relay_status: HashMap::new(),
        }
    }

    pub fn get_active_relays(&self) -> Vec<String> {
        match self.mode {
            RelayMode::Hybrid => {
                let mut relays = self.default_relays.clone();
                relays.extend(self.custom_relays.clone());
                relays
            }
            RelayMode::Exclusive => self.custom_relays.clone(),
        }
    }

    pub fn add_relay(&mut self, relay: String) {
        if !self.custom_relays.contains(&relay) {
            self.custom_relays.push(relay);
        }
    }

    pub fn remove_relay(&mut self, relay: &str) {
        self.custom_relays.retain(|r| r != relay);
    }

    pub fn set_mode(&mut self, mode: RelayMode) {
        self.mode = mode;
    }

    pub fn update_status(&mut self, relay: &str, status: RelayStatus) {
        self.relay_status.insert(relay.to_string(), status);
    }

    pub fn get_status(&self, relay: &str) -> Option<&RelayStatus> {
        self.relay_status.get(relay)
    }

    pub fn get_mode(&self) -> &RelayMode {
        &self.mode
    }

    pub fn get_default_relays(&self) -> Vec<String> {
        self.default_relays.clone()
    }

    pub fn get_custom_relays(&self) -> Vec<String> {
        self.custom_relays.clone()
    }

    pub fn get_all_status(&self) -> Vec<(String, RelayStatus)> {
        self.relay_status
            .iter()
            .map(|(url, status)| (url.clone(), status.clone()))
            .collect()
    }
}

impl Default for RelayManager {
    fn default() -> Self {
        Self::new()
    }
}
