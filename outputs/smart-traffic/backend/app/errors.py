def err(code: str, message: str, detail=None) -> dict:
    return {'error': {'code': code, 'message': message, 'detail': detail}}
