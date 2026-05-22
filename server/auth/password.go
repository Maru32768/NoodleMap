package auth

import "golang.org/x/crypto/bcrypt"

func hashPassword(password string, salt string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password+salt), bcrypt.DefaultCost)
	return string(hash), err
}

func verifyPassword(hash, password, salt string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password+salt))
	return err == nil
}
