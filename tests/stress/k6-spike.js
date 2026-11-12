// Prueba spike contra POST /simulate (modelo cerrado: cada usuario espera su respuesta).
// Uso: k6 run tests/stress/k6-spike.js
//      BASE_URL=http://traefik CIRCUITO=circuitos/escalera-1000.json VUS=100 k6 run k6-spike.js
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const VUS = Number(__ENV.VUS || 100);
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const CIRCUITO = __ENV.CIRCUITO || './circuitos/escalera-1000.json';

export const options = {
    stages: [
        { duration: '10s', target: VUS },
        { duration: '20s', target: VUS },
        { duration: '10s', target: 0 },
    ],
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'max'],
};

const cuerpo = open(CIRCUITO);
const parametros = { headers: { 'Content-Type': 'application/json' }, timeout: '60s' };

const respuestas200 = new Counter('respuestas_200');
const respuestas429 = new Counter('respuestas_429');
const respuestas503 = new Counter('respuestas_503');
const respuestas503ConRetryAfter = new Counter('respuestas_503_con_retry_after');
const respuestasOtras = new Counter('respuestas_otras');
// Latencia solo de las respuestas exitosas: los 429 instantáneos bajan la de http_req_duration.
const duracion200 = new Trend('duracion_200', true);

export default function () {
    const res = http.post(`${BASE_URL}/simulate`, cuerpo, parametros);
    if (res.status === 200) {
        respuestas200.add(1);
        duracion200.add(res.timings.duration);
    } else if (res.status === 429) {
        respuestas429.add(1);
    } else if (res.status === 503) {
        respuestas503.add(1);
        if (res.headers['Retry-After']) respuestas503ConRetryAfter.add(1);
    } else {
        respuestasOtras.add(1);
    }
    check(res, { 'status 200': (r) => r.status === 200 });
}
