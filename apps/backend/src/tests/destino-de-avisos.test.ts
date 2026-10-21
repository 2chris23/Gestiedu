import { esDestinoWeb } from '../services/avisos.service';

/**
 * SSRF-01 (2026-10-04): el servidor hace un POST a la dirección de Web Push que
 * le da el teléfono. Solo puede ser la de un servicio de avisos de verdad.
 */
describe('A dónde se mandan los avisos web (SSRF-01)', () => {
    it('acepta los servicios de avisos de los navegadores', () => {
        expect(esDestinoWeb('https://fcm.googleapis.com/fcm/send/abc-0123456789')).toBe(true);
        expect(esDestinoWeb('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
        expect(esDestinoWeb('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true);
        expect(esDestinoWeb('https://web.push.apple.com/QGuQyavXutnMH')).toBe(true);
    });

    it('rechaza direcciones internas, otros servidores y trucos', () => {
        for (const malo of [
            'https://169.254.169.254/latest/meta-data/',
            'https://localhost/admin',
            'https://10.0.0.5/interno',
            'https://ejemplo.com/fcm.googleapis.com',
            'https://fcm.googleapis.com.ejemplo.com/x',
            'https://fcm.googleapis.com:8443/x0123456789',
            'https://usuario:clave@fcm.googleapis.com/x0123456789',
            'http://fcm.googleapis.com/fcm/send/abc-0123456789',
            'https://evilpush.apple.com.evil.net/x',
        ]) {
            expect([malo, esDestinoWeb(malo)]).toEqual([malo, false]);
        }
    });
});
