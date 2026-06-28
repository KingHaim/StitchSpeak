export interface GoogleCredentialResponse {
  credential?: string;
  select_by?: string;
}

export interface GoogleButtonOptions {
  type: 'standard' | 'icon';
  theme: 'outline' | 'filled_blue' | 'filled_black';
  size: 'large' | 'medium' | 'small';
  text: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment: 'left' | 'center';
  width: number;
}

let initialized = false;
let currentCredentialHandler: ((response: GoogleCredentialResponse) => void) | null = null;

function dispatchCredential(response: GoogleCredentialResponse): void {
  currentCredentialHandler?.(response);
}

/**
 * Google Identity Services has one global configuration per page. Repeated
 * initialize() calls overwrite its callback and are especially fragile on
 * Safari's ITP popup flow, so every caller shares this singleton.
 */
export function initializeGoogleIdentity(
  clientId: string,
  onCredential: (response: GoogleCredentialResponse) => void,
): boolean {
  currentCredentialHandler = onCredential;
  const id = window.google?.accounts?.id;
  if (!id) return false;
  if (initialized) return true;

  id.initialize({
    client_id: clientId,
    callback: dispatchCredential,
    auto_select: true,
    cancel_on_tap_outside: false,
    itp_support: true,
    use_fedcm_for_prompt: true,
    use_fedcm_for_button: true,
  });
  initialized = true;
  return true;
}

export function renderGoogleIdentityButton(
  element: HTMLElement,
  options: GoogleButtonOptions,
): boolean {
  const id = window.google?.accounts?.id;
  if (!initialized || !id) return false;
  element.replaceChildren();
  id.renderButton(element, options);
  return true;
}
