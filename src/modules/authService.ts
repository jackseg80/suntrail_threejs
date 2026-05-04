import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface UserProfile {
    id: string;
    email: string;
}

export class AuthService {
    private _user: UserProfile | null = null;
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
            this._user = {
                id: session.user.id,
                email: session.user.email ?? '',
            };
        } else {
            this._user = null;
        }
    }

    get user() {
        return this._user;
    }

    get isAuthenticated() {
        return !!this._user;
    }

    async signUp(email: string, pass: string) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password: pass,
        });
        if (error) throw error;
        return data;
    }

    async signIn(email: string, pass: string) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: pass,
        });
        if (error) throw error;
        return data;
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
}

export const authService = new AuthService();
