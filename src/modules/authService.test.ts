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
            error: null 
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
            error: null 
        } as any);

        const { AuthService } = await import('./authService');
        const service = new (AuthService as any)();
        await service.waitForInit();

        expect(service.user).toEqual({ id: 'test-uid', email: 'test@suntrail.app' });
        expect(service.isAuthenticated).toBe(true);
    });

    it('should sign in successfully', async () => {
        const mockSignIn = vi.mocked(supabase.auth.signInWithPassword);
        mockSignIn.mockResolvedValueOnce({
            data: { session: { user: { id: 'new-uid', email: 'login@test.com' } } },
            error: null
        } as any);

        const result = await authService.signIn('login@test.com', 'pass123');
        expect(mockSignIn).toHaveBeenCalledWith({
            email: 'login@test.com',
            password: 'pass123'
        });
        expect(result.session.user.id).toBe('new-uid');
    });

    it('should sign out successfully', async () => {
        const mockSignOut = vi.mocked(supabase.auth.signOut);
        mockSignOut.mockResolvedValueOnce({ error: null } as any);

        await authService.signOut();
        expect(mockSignOut).toHaveBeenCalled();
        expect(authService.user).toBeNull();
    });
});
