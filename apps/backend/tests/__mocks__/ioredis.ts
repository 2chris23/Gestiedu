const Redis = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    subscribe: jest.fn(),
    publish: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    quit: jest.fn(),
    disconnect: jest.fn(),
}));

module.exports = Redis;
