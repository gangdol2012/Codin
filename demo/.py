import os
import openai
import term_image

from openai._client import OpenAI

# The client automatically picks up the OPENAI_API_KEY environment variable
client = OpenAI(api_key = "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")

response = client.chat.completions.create(
    model="gpt-image-1.5", # Specify the model you want to use
    messages=[
        {"role": "system", "content": "You are a creative artist."},
        {"role": "user", "content": """create a image of a banana"""}
    ],
)

image_url = response.data[0].url
print(image_url)





