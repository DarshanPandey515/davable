import httpx
from dotenv import load_dotenv
from groq import Groq, AsyncGroq
from pydantic_ai.models.groq import GroqModel
from pydantic_ai.profiles.openai import OpenAIJsonSchemaTransformer
from pydantic_ai.providers.groq import GroqProvider

load_dotenv()


_timeout_kwargs = dict(timeout=httpx.Timeout(60.0, connect=15.0), max_retries=3)
_groq_client = AsyncGroq(**_timeout_kwargs)

groq_sync_client = Groq(**_timeout_kwargs)

GROQ_MODEL_NAME = "openai/gpt-oss-120b"
MODEL = GroqModel(GROQ_MODEL_NAME, provider=GroqProvider(groq_client=_groq_client))


def structured_completion(system_prompt: str,user_prompt: str,schema_model,schema_name: str,max_completion_tokens: int = 4096,):
    
    raw_schema = schema_model.model_json_schema()
    strict_schema = OpenAIJsonSchemaTransformer(raw_schema, strict=True).walk()

    response = groq_sync_client.chat.completions.create(
        model=GROQ_MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {"name": schema_name, "schema": strict_schema, "strict": True},
        },
        max_completion_tokens=max_completion_tokens,
        reasoning_effort="low",
    )
    content = response.choices[0].message.content
    return schema_model.model_validate_json(content)