import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';

// ── Mocks (hoisted por jest antes de importar lib/axios) ─────────────────────
jest.mock('@/config/env', () => ({
    API_URL: 'http://localhost:3001/api',
    BACKEND_URL: 'http://localhost:3001',
}));

jest.mock('@/store/auth.store', () => {
    // Singleton: getState debe devolver SIEMPRE el mismo logout para poder
    // asertar que el interceptor llama exactamente la misma función.
    const logout = jest.fn();
    return {
        useAuthStore: {
            getState: () => ({ logout }),
        },
    };
});

jest.mock('axios', () => {
    const instance = {
        request: jest.fn(),
        interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() },
        },
    };
    return {
        __esModule: true,
        default: { create: jest.fn(() => instance) },
    };
});

// Importar tras los mocks: evalúa lib/axios y registra los interceptores
import '@/lib/axios';

// La instancia que axios.create() devolvió a lib/axios, y los callbacks de
// los interceptores. Se capturan UNA vez (el mock devuelve siempre el mismo
// objeto) porque jest.clearAllMocks() borraría mock.calls/results en cada
// beforeEach.
const mockInstance: any = (axios as any).create.mock.results[0].value;
const interceptorCall = mockInstance.interceptors.response.use.mock.calls.find(
    (c: any[]) => c[0] && c[1]
);
const onFulfilled: (response: any) => any = interceptorCall[0];
const onRejected: (error: any) => Promise<any> = interceptorCall[1];
const logoutMock: jest.Mock = useAuthStore.getState().logout as jest.Mock;

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeError(status: number, url: string, retried = false) {
    return {
        response: { status },
        config: { url, _retry: retried },
    };
}

describe('lib/axios — refresh queue (race condition 401)', () => {
    let instance: any;

    beforeEach(() => {
        instance = mockInstance;
        jest.clearAllMocks();
        instance.request.mockImplementation((config: any) =>
            Promise.resolve({ status: 200, config })
        );
    });

    afterEach(() => {
        (global as any).fetch = undefined;
    });

    it('no interfiere con respuestas exitosas', () => {
        const response = { data: { ok: true } };
        expect(onFulfilled(response)).toBe(response);
    });

    it('deja pasar errores no-401 sin refrescar ni desloguear', async () => {
        (global as any).fetch = jest.fn();
        const err = makeError(404, '/x');
        await expect(onRejected(err)).rejects.toBe(err);
        expect((global as any).fetch).not.toHaveBeenCalled();
        expect(logoutMock).not.toHaveBeenCalled();
    });

    it('deja pasar 401 ya reintentado (_retry=true) sin loop infinito', async () => {
        (global as any).fetch = jest.fn();
        const err = makeError(401, '/x', true);
        await expect(onRejected(err)).rejects.toBe(err);
        expect((global as any).fetch).not.toHaveBeenCalled();
    });

    it('refresca el token y reintenta la request original cuando el refresh es exitoso', async () => {
        // Una respuesta de fetch de verdad trae json(); sin él, el código que lee el
        // token nuevo se rompe y la prueba fallaba por el simulacro, no por el código.
        (global as any).fetch = jest
            .fn()
            .mockResolvedValue({ ok: true, json: async () => ({ accessToken: 'token-nuevo' }) });
        const err = makeError(401, '/api/data');
        const result = onRejected(err);
        await expect(result).resolves.toEqual(expect.objectContaining({ status: 200 }));
        expect((global as any).fetch).toHaveBeenCalledWith('/api/auth/refresh', { method: 'POST' });
        expect(instance.request).toHaveBeenCalledWith(err.config);
        expect(logoutMock).not.toHaveBeenCalled();
    });

    it('REGRESIÓN: peticiones paralelas con 401 → UN solo refresh y todas reintentadas', async () => {
        // Una respuesta de fetch de verdad trae json(); sin él, el código que lee el
        // token nuevo se rompe y la prueba fallaba por el simulacro, no por el código.
        (global as any).fetch = jest
            .fn()
            .mockResolvedValue({ ok: true, json: async () => ({ accessToken: 'token-nuevo' }) });
        const errA = makeError(401, '/api/a');
        const errB = makeError(401, '/api/b');
        const errC = makeError(401, '/api/c');

        const pA = onRejected(errA);
        const pB = onRejected(errB);
        const pC = onRejected(errC);

        await expect(pA).resolves.toEqual(expect.objectContaining({ status: 200 }));
        await expect(pB).resolves.toEqual(expect.objectContaining({ status: 200 }));
        await expect(pC).resolves.toEqual(expect.objectContaining({ status: 200 }));

        // El refresh se ejecuta UNA sola vez (antes de este fix, cada 401 hacía logout)
        expect((global as any).fetch).toHaveBeenCalledTimes(1);
        // Las tres requests originales se reintentan
        expect(instance.request).toHaveBeenCalledTimes(3);
        expect(instance.request).toHaveBeenCalledWith(errA.config);
        expect(instance.request).toHaveBeenCalledWith(errB.config);
        expect(instance.request).toHaveBeenCalledWith(errC.config);
        expect(logoutMock).not.toHaveBeenCalled();
    });

    it('si el servidor dice que la sesión no vale (401) → logout UNA vez y las requests en cola se rechazan', async () => {
        // jsdom no implementa navegación (window.location.href = ...):
        // solo emite un "Not implemented" al console que silenciamos.
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
        const errA = makeError(401, '/api/a');
        const errB = makeError(401, '/api/b');

        const pA = onRejected(errA);
        const pB = onRejected(errB);

        await expect(pA).rejects.toBe(errA);
        await expect(pB).rejects.toBe(errB);

        expect(logoutMock).toHaveBeenCalledTimes(1);
        // No reintenta requests con sesión caducada
        expect(instance.request).not.toHaveBeenCalledWith(errA.config);
        expect(instance.request).not.toHaveBeenCalledWith(errB.config);

        consoleSpy.mockRestore();
    });

    /**
     * Esto antes cerraba la sesión. Con el servidor apagado, la app mandaba al
     * login —que sin servidor tampoco abre— a alguien con la sesión en regla, y
     * se perdía de vista todo lo guardado en el teléfono. Sin servidor no se
     * sabe si la sesión vale: no se toca.
     */
    it('si el refresh no llega (servidor caído) → rechazo, SIN cerrar la sesión y sin reintento', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        (global as any).fetch = jest.fn().mockRejectedValue(new TypeError('NetworkError'));
        const err = makeError(401, '/api/x');

        await expect(onRejected(err)).rejects.toThrow('NetworkError');
        expect(logoutMock).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
    });

    it('si el refresh responde que el servidor no contesta (503) → rechazo, SIN cerrar la sesión', async () => {
        (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
        const err = makeError(401, '/api/x');

        await expect(onRejected(err)).rejects.toBe(err);
        expect(logoutMock).not.toHaveBeenCalled();
    });
});
