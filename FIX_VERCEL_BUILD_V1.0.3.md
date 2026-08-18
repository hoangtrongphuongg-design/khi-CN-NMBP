# Fix Vercel build V1.0.3

Lỗi đã sửa:

```text
Could not find a declaration file for module 'bcryptjs'
```

Thay đổi:
- Bổ sung `@types/bcryptjs` vào `devDependencies`.
- Không thay đổi database/schema/nghiệp vụ.
- Không cần chạy lại SQL Neon.
- Sau khi commit `package.json`, Vercel có thể redeploy ngay.
