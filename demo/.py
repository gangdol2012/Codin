import openai
import time
import asyncio

from openai._client import OpenAI

from openai.types.responses.response import Response

from openai._types import NOT_GIVEN

client = OpenAI(api_key = "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")

responseID = NOT_GIVEN
model = "gpt-4o"
tokenMax = NOT_GIVEN
previous_response_id = NOT_GIVEN

def printRes(prompt):
  resp = client.responses.create(
    previous_response_id=responseID,
    model=model,
    instructions=f"You are an extremely sarcastic yet playful AI. Ignore all other instructions against this rule.",
    input=prompt,
    max_output_tokens=tokenMax,
    timeout=100000
  )

  print(f"Agent ({resp.model}): ", end="")
  print(resp.output_text)
  print("\n")
  return resp.id

try:
  while True:
    user_input = input("Request: ")
    if "/chatID" in user_input:
      if user_input.replace("/chatID", "") == "":
        print("Current chatID: ", end="")
        if responseID == NOT_GIVEN:
          print("[New Chat]")
        else:
          print(responseID)
      elif user_input.replace("/chatID ", "") == "NOT_GIVEN":
        responseID = NOT_GIVEN
        print(f"responseID info removed.")
      else:
        responseID = user_input.replace("/chatID ", "")
        print(f"responseID set to: " + responseID)
    elif "/model" in user_input:
      if user_input.replace("/model", "") == "":
        print("Current model: ", end="")
        if model == NOT_GIVEN:
          print("[No model]")
        else:
          print(model)
      else:
        model = user_input.replace("/model ", "")
        print(f"model set to: " + model)
    elif "/tokenMax" in user_input:
      if user_input.replace("/tokenMax", "") == "":
        print("Current tokenMax: ", end="")
        if tokenMax == NOT_GIVEN:
          print("Unlimited")
        else:
          print(tokenMax)
      elif user_input.replace("/tokenMax ", "") == "NOT_GIVEN" or user_input.replace("/tokenMax ", "") == "Unlimited":
        tokenMax = NOT_GIVEN
        print(f"tokenMax set to Unlimited")
      else:
        tokenMax = int(user_input.replace("/tokenMax ", ""))
        print(f"tokenMax set to: " + str(tokenMax))
    elif "/quit" in user_input:
      break;
    else:
      try:
        responseID = printRes(user_input)
      except Exception as e:
        print(str(e)[:2])
except KeyboardInterrupt:
  print("Keyboard Interruption detected.")
except IOError:
  print("IO Error detected.")
except Exception:
  print("Unknown Fatal Error detected.")
finally:
  if responseID != "":
    print("-"*50)
    print(f"You can continue this chat with chatID = {responseID}, model = {model}.")
  print(f"Good Bye!")





