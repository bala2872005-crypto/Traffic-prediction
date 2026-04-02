/**
 * Authentication Module
 * Handles session management, token storage, and page protection.
 */

const Auth = (() => {
    const TOKEN_KEY = 'traffic_system_token';
    const USER_KEY = 'traffic_system_user';

    /**
     * Save session data to localStorage
     */
    function saveSession(token, username) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, username);
    }

    /**
     * Clear session data and logout
     */
    function logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        window.location.href = '/login';
    }

    /**
     * Check if user is currently logged in
     */
    function isLoggedIn() {
        const token = localStorage.getItem(TOKEN_KEY);
        // In a real app, we'd verify the token with the backend
        return !!token;
    }

    /**
     * Get the current logged in username
     */
    function getUser() {
        return localStorage.getItem(USER_KEY) || 'Guest';
    }

    /**
     * Protect a page: redirect to login if not authenticated
     */
    function protectPage() {
        const path = window.location.pathname;
        const isLoginPage = path.includes('/login');
        const isRegisterPage = path.includes('/register');

        if (!isLoggedIn() && !isLoginPage && !isRegisterPage) {
            console.log('🛡️ Auth: Not logged in. Redirecting to login...');
            window.location.href = '/login';
        } else if (isLoggedIn() && isLoginPage) {
            console.log('🛡️ Auth: Already logged in. Redirecting to dashboard...');
            window.location.href = '/app';
        }
    }

    // Initialize protection
    protectPage();

    return {
        saveSession,
        logout,
        isLoggedIn,
        getUser,
        protectPage
    };
})();
