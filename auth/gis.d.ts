// Minimal typings for the Google Identity Services (GIS) browser global.
// The GIS script is loaded by @react-oauth/google's GoogleOAuthProvider.
export {};

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: { credential?: string; select_by?: string }) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  itp_support?: boolean;
  use_fedcm_for_prompt?: boolean;
  use_fedcm_for_button?: boolean;
}

interface GoogleAccountsId {
  initialize: (config: GoogleIdConfiguration) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type: 'standard' | 'icon';
      theme: 'outline' | 'filled_blue' | 'filled_black';
      size: 'large' | 'medium' | 'small';
      text: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment: 'left' | 'center';
      width: number;
    },
  ) => void;
  prompt: (
    listener?: (notification: {
      isNotDisplayed: () => boolean;
      isSkippedMoment: () => boolean;
      isDismissedMoment: () => boolean;
    }) => void,
  ) => void;
  disableAutoSelect: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}
