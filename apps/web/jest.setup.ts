
import '@testing-library/jest-dom';

// Global mock for lucide-react to ensure icons work in all tests
jest.mock('lucide-react', () => {
    const React = require('react');
    const createIcon = (name: string) => {
        const Icon = (props: any) =>
            React.createElement('div', { 'data-testid': `icon-${name}`, ...props });
        Icon.displayName = `Icon${name}`;
        return Icon;
    };

    return {
        X: createIcon('x'),
        User: createIcon('user'),
        Calendar: createIcon('calendar'),
        ChevronRight: createIcon('chevron-right'),
        GraduationCap: createIcon('graduation-cap'),
        School: createIcon('school'),
    };
});
