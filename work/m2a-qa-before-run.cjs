// M2a (không commit): chạy qa-traffic-31 trên CẢNH TRƯỚC M2a để xem lỗi WebGL có sẵn hay do M2a.
process.env.PORT = '8841';
process.env.SAMPLE_S = '20';
process.env.CITY_URL = 'http://127.0.0.1:8841/hcmc-poc/tmp-before-24.html';
require('../outputs/hcmc-poc/scripts/qa-traffic-31.cjs');
