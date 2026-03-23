inputStr = input()
charList = []
for i in range(26):
  charList.append("-1");


for i in range(len(inputStr)):
  char = inputStr[i]
  if charList[ord(char)-97] == "-1":
    charList[ord(char)-97] = str(i)

print(" ".join(charList))