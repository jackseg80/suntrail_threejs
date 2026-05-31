import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService, supabase } from './authService';

describe('AuthService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with null user when no session exists', async () => {
        const mockGetSession = vi.mocked(supabase.auth.getSession);
        mockGetSession.mockResolvedValueOnce({
            data: { session: null },
            error: null,
        } as any);

        // On recrée l'instance pour forcer l'init avec le mock
        const { AuthService } = await import('./authService');
        const service = new (AuthService as any)();
        await service.waitForInit();

        expect(service.user).toBeNull();
        expect(service.isAuthenticated).toBe(false);
    });

    it('should set user when session exists', async () => {
        const mockUser = { id: 'test-uid', email: 'test@suntrail.app' };
        const mockGetSession = vi.mocked(supabase.auth.getSession);
        mockGetSession.mockResolvedValueOnce({
            data: { session: { user: mockUser } },
            error: null,
        } as any);

        const { AuthService } = await import('./authService');
        const service = new (AuthService as any)();
        await service.waitForInit();

        expect(service.user).toEqual({
            id: 'test-uid',
            email: 'test@suntrail.app',
        });
        expect(service.isAuthenticated).toBe(true);
    });

    it('should sign out successfully', async () => {
        const mockSignOut = vi.mocked(supabase.auth.signOut);
        mockSignOut.mockResolvedValueOnce({ error: null } as any);

        await authService.signOut();
        expect(mockSignOut).toHaveBeenCalled();
        expect(authService.user).toBeNull();
    });

    it('should call supabase.rpc delete_user_account on deleteAccount()', async () => {
        vi.mocked(supabase.rpc).mockResolvedValueOnce({
            data: null,
            error: null,
        } as any);
        vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({
            error: null,
        } as any);

        const { error } = await authService.deleteAccount();

        expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith(
            'delete_user_account'
        );
        expect(error).toBeNull();
    });

    it('should sign out and remove rc_web_user_id after successful deletion', async () => {
        vi.mocked(supabase.rpc).mockResolvedValueOnce({
            data: null,
            error: null,
        } as any);
        vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({
            error: null,
        } as any);
        const removeSpy = vi.spyOn(window.localStorage, 'removeItem');

        await authService.deleteAccount();

        expect(vi.mocked(supabase.auth.signOut)).toHaveBeenCalled();
        expect(removeSpy).toHaveBeenCalledWith('rc_web_user_id');
    });

    it('should return error without signing out on RPC failure', async () => {
        const rpcError = new Error('RPC failed');
        vi.mocked(supabase.rpc).mockResolvedValueOnce({
            data: null,
            error: rpcError,
        } as any);

        const { error } = await authService.deleteAccount();

        expect(error).toBe(rpcError);
        expect(vi.mocked(supabase.auth.signOut)).not.toHaveBeenCalled();
    });

    describe('signInWithGoogle', () => {
        it('web: appelle signInWithOAuth sans Browser.open', async () => {
            const { Browser } = await import('@capacitor/browser');
            vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValueOnce({
                data: { provider: 'google', url: 'https://oauth.example.com' },
                error: null,
            } as any);

            await authService.signInWithGoogle();

            expect(
                vi.mocked(supabase.auth.signInWithOAuth)
            ).toHaveBeenCalledWith(
                expect.objectContaining({ provider: 'google' })
            );
            expect(vi.mocked(Browser.open)).not.toHaveBeenCalled();
        });

        it('lance une exception si signInWithOAuth renvoie une erreur', async () => {
            const oauthError = new Error('OAuth failed');
            vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValueOnce({
                data: { provider: 'google', url: null },
                error: oauthError,
            } as any);

            await expect(authService.signInWithGoogle()).rejects.toThrow(
                'OAuth failed'
            );
        });
    });

    describe('linkGoogleAccount', () => {
        it('appelle linkIdentity avec le provider google', async () => {
            vi.mocked(supabase.auth.linkIdentity).mockResolvedValueOnce({
                data: { provider: 'google', url: 'https://oauth.example.com' },
                error: null,
            } as any);

            await authService.linkGoogleAccount();

            expect(vi.mocked(supabase.auth.linkIdentity)).toHaveBeenCalledWith(
                expect.objectContaining({ provider: 'google' })
            );
        });
    });

    describe('isGoogleLinked', () => {
        it('retourne true si le provider google est présent dans les identities', async () => {
            const mockUser = {
                id: 'uid-1',
                email: 'test@test.com',
                identities: [{ provider: 'google', id: 'gid-1' }],
            };
            vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
                data: { session: { user: mockUser } },
                error: null,
            } as any);

            const { AuthService } = await import('./authService');
            const service = new (AuthService as any)();
            await service.waitForInit();

            expect(service.isGoogleLinked()).toBe(true);
        });

        it('retourne false si aucune identité google', async () => {
            const mockUser = {
                id: 'uid-2',
                email: 'test@test.com',
                identities: [{ provider: 'email', id: 'eid-1' }],
            };
            vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
                data: { session: { user: mockUser } },
                error: null,
            } as any);

            const { AuthService } = await import('./authService');
            const service = new (AuthService as any)();
            await service.waitForInit();

            expect(service.isGoogleLinked()).toBe(false);
        });
    });
});
