import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface UserProfile {
    id: string;
    email: string;
}

export class AuthService {
    private _user: UserProfile | null = null;
    private _rawUser: any = null;
    private _initialized = false;
    private _initPromise: Promise<void> | null = null;

    constructor() {
        this._initPromise = this.init();
    }

    public async waitForInit() {
        if (this._initialized) return;
        await this._initPromise;
    }

    private async init() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            this._setUserFromSession(session);
        } catch (e) {
            console.error('[Auth] Error getting session:', e);
        }

        this._initialized = true;

        supabase.auth.onAuthStateChange((_event, session) => {
            this._setUserFromSession(session);
        });
    }

    private _setUserFromSession(session: any) {
        if (session?.user) {
            this._rawUser = session.user;
            this._user = {
                id: session.user.id,
                email: session.user.email ?? '',
            };
        } else {
            this._rawUser = null;
            this._user = null;
        }
    }

    get user() {
        return this._user;
    }

    get isAuthenticated() {
        return !!this._user;
    }

    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        this._user = null;
    }

    async getSession() {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        return session;
    }

    private async _openGoogleOAuth(method: 'signInWithOAuth' | 'linkIdentity'): Promise<void> {
        const isNative = Capacitor.isNativePlatform();
        const isProd = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
        const redirectTo = isNative
            ? 'com.suntrail.threejs://login-callback'
            : `${window.location.origin}${isProd ? '/suntrail_threejs/' : '/'}app.html`;

        const opts = { provider: 'google' as const, options: { redirectTo, skipBrowserRedirect: isNative } };
        const result = method === 'signInWithOAuth'
            ? await supabase.auth.signInWithOAuth(opts)
            : await supabase.auth.linkIdentity(opts);

        if (result.error) throw result.error;

        if (isNative && (result.data as any)?.url) {
            const { Browser } = await import('@capacitor/browser');
            await Browser.open({ url: (result.data as any).url });
        }
    }

    async signInWithGoogle(): Promise<void> {
        return this._openGoogleOAuth('signInWithOAuth');
    }

    async linkGoogleAccount(): Promise<void> {
        return this._openGoogleOAuth('linkIdentity');
    }

    isGoogleLinked(): boolean {
        return this._rawUser?.identities?.some((i: any) => i.provider === 'google') ?? false;
    }

    async deleteAccount(): Promise<{ error: Error | null }> {
        const { error } = await supabase.rpc('delete_user_account');
        if (!error) {
            await this.signOut();
            localStorage.removeItem('rc_web_user_id');
        }
        return { error: error as Error | null };
    }
}

export const authService = new AuthService();
