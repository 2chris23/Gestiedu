import { firmar, RESUMEN_VACIO } from '../../utils/firma-s3';

/**
 * La firma se compara con el ejemplo publicado por Amazon en la documentación
 * de «Signature Version 4» para S3 (GET Object con Range), con sus mismas
 * credenciales de ejemplo. Si un solo carácter del proceso está mal, la firma
 * sale completamente distinta: no hay «casi bien».
 */
describe('La firma de S3/R2', () => {
    it('S3-01: reproduce la firma del ejemplo oficial de Amazon', () => {
        const cabeceras = firmar(
            {
                metodo: 'GET',
                url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
                cabeceras: { Range: 'bytes=0-9' },
                resumenDelCuerpo: RESUMEN_VACIO,
                region: 'us-east-1',
                cuando: new Date('2013-05-24T00:00:00Z'),
            },
            {
                accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
            }
        );

        expect(cabeceras.authorization).toBe(
            'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
                'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
                'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'
        );
        expect(cabeceras['x-amz-date']).toBe('20130524T000000Z');
    });
});
