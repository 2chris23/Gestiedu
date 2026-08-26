import { sanitizeHTML } from '../src/utils/sanitize';

describe('Simple Sanitization Tests', () => {
    it('should remove script tags', () => {
        const input = '<script>alert("XSS")</script>Hello';
        const output = sanitizeHTML(input);
        expect(output).not.toContain('<script>');
        expect(output).toContain('Hello');
    });

    it('should allow safe tags', () => {
        const input = '<b>Bold</b> and <i>italic</i>';
        const output = sanitizeHTML(input);
        expect(output).toContain('<b>');
        expect(output).toContain('<i>');
    });

    it('should handle null input', () => {
        expect(sanitizeHTML(null)).toBe('');
        expect(sanitizeHTML(undefined)).toBe('');
    });
});
