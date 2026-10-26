// unknown 값에서 필드를 안전하게 꺼낸다. `any` 캐스팅 대신 쓴다.
export function readField(value: unknown, key: string): unknown {
    if (typeof value !== "object" || value === null) return undefined
    return Reflect.get(value, key)
}

export function readString(value: unknown, key: string): string {
    const field = readField(value, key)
    return typeof field === "string" ? field : ""
}

// 배열이 아니면 빈 배열. Array.isArray는 any[]로 좁혀서 unknown[]로 받는다.
export function readArray(value: unknown, key: string): unknown[] {
    const field = readField(value, key)
    return Array.isArray(field) ? field : []
}

// catch(error: unknown)에서 message를 꺼낸다. Error가 아니어도 message 필드가 있으면 읽는다.
export function errorMessage(error: unknown): string {
    return readString(error, "message")
}

// Stripe 에러의 type(예: "StripeAuthenticationError")을 꺼낸다.
export function errorType(error: unknown): string {
    return readString(error, "type")
}
