const SERVICE: &str = "core-ftp";

fn entry(site_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, &format!("site-{}", site_id)).map_err(|e| e.to_string())
}

pub fn save_password(site_id: &str, password: &str) -> Result<(), String> {
    if password.is_empty() {
        return delete_password(site_id);
    }
    entry(site_id)?.set_password(password).map_err(|e| e.to_string())
}

pub fn load_password(site_id: &str) -> Option<String> {
    entry(site_id).ok()?.get_password().ok()
}

pub fn delete_password(site_id: &str) -> Result<(), String> {
    match entry(site_id) {
        Ok(e) => match e.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        },
        Err(_) => Ok(()),
    }
}

fn keypass_entry(site_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, &format!("site-{}-keypass", site_id)).map_err(|e| e.to_string())
}

pub fn save_key_passphrase(site_id: &str, pass: &str) -> Result<(), String> {
    if pass.is_empty() {
        return delete_key_passphrase(site_id);
    }
    keypass_entry(site_id)?
        .set_password(pass)
        .map_err(|e| e.to_string())
}

pub fn load_key_passphrase(site_id: &str) -> Option<String> {
    keypass_entry(site_id).ok()?.get_password().ok()
}

pub fn delete_key_passphrase(site_id: &str) -> Result<(), String> {
    match keypass_entry(site_id) {
        Ok(e) => match e.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        },
        Err(_) => Ok(()),
    }
}
