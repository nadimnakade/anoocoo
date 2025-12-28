using System.Security.Cryptography;
using System.Text;

namespace Anooco.API.Services
{
    public interface IEncryptionService
    {
        string Encrypt(string plainText);
        string Decrypt(string cipherText);
    }

    public class EncryptionService : IEncryptionService
    {
        private readonly string _key;

        public EncryptionService(IConfiguration configuration)
        {
            _key = configuration["Security:EncryptionKey"] ?? "DefaultKey1234567890123456789012";
            // Ensure key is 32 bytes for AES-256
            if (_key.Length < 32) _key = _key.PadRight(32, '0');
            if (_key.Length > 32) _key = _key.Substring(0, 32);
        }

        public string Encrypt(string plainText)
        {
            if (string.IsNullOrEmpty(plainText)) return plainText;

            using (var aes = Aes.Create())
            {
                aes.Key = Encoding.UTF8.GetBytes(_key);
                aes.GenerateIV();
                var iv = aes.IV;

                using (var encryptor = aes.CreateEncryptor(aes.Key, iv))
                using (var ms = new MemoryStream())
                {
                    ms.Write(iv, 0, iv.Length); // Prepend IV
                    using (var cs = new CryptoStream(ms, encryptor, CryptoStreamMode.Write))
                    using (var sw = new StreamWriter(cs))
                    {
                        sw.Write(plainText);
                    }
                    return Convert.ToBase64String(ms.ToArray());
                }
            }
        }

        public string Decrypt(string cipherText)
        {
            if (string.IsNullOrEmpty(cipherText)) return cipherText;

            try 
            {
                var fullCipher = Convert.FromBase64String(cipherText);
                
                using (var aes = Aes.Create())
                {
                    aes.Key = Encoding.UTF8.GetBytes(_key);
                    
                    var iv = new byte[16];
                    var cipher = new byte[fullCipher.Length - 16];
                    
                    Buffer.BlockCopy(fullCipher, 0, iv, 0, 16);
                    Buffer.BlockCopy(fullCipher, 16, cipher, 0, cipher.Length);
                    
                    aes.IV = iv;

                    using (var decryptor = aes.CreateDecryptor(aes.Key, aes.IV))
                    using (var ms = new MemoryStream(cipher))
                    using (var cs = new CryptoStream(ms, decryptor, CryptoStreamMode.Read))
                    using (var sr = new StreamReader(cs))
                    {
                        return sr.ReadToEnd();
                    }
                }
            }
            catch
            {
                // Return original if decryption fails (or handle error)
                return cipherText;
            }
        }
    }
}